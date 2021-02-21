const express = require('express');
const Joi = require('joi');
const Boom = require('boom');
const bcrypt = require('bcryptjs');
const uuidv4 = require('uuid/v4');
const { GraphQLClient } = require('graphql-request');
const { HASURA_GRAPHQL_ENDPOINT, HASURA_GRAPHQL_ADMIN_SECRET } = process.env

const graphql_client = new GraphQLClient(HASURA_GRAPHQL_ENDPOINT, {
  headers: {
    'Content-Type': 'application/json',
    'x-hasura-admin-secret': HASURA_GRAPHQL_ADMIN_SECRET,
  },
});


const {
  USER_FIELDS,
  USER_REGISTRATION_AUTO_ACTIVE,
  USER_MANAGEMENT_DATABASE_SCHEMA_NAME,
  REFRESH_TOKEN_EXPIRES,
  JWT_TOKEN_EXPIRES,
} = require('../config');

const auth_tools = require('./auth-tools');

let router = express.Router();

const schema_name = USER_MANAGEMENT_DATABASE_SCHEMA_NAME === 'public' ? '' :  USER_MANAGEMENT_DATABASE_SCHEMA_NAME.toString().toLowerCase() + '_';

router.post('/register', async (req, res, next) => {

  let hasura_data;
  let password_hash;

  const schema = Joi.object().keys({
    username: Joi.string().required(),
    password: Joi.string().required(),
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    return next(Boom.badRequest(error.details[0].message));
  }

  const { username, password } = value;

  // generate password_hash
  try {
    password_hash = await bcrypt.hash(password, 10);
  } catch(e) {
    console.error(e);
    return next(Boom.badImplementation("Unable to generate 'password hash'"));
  }

  // insert user
  query = `
  mutation (
    $user: ${schema_name}users_insert_input!
  ) {
    insert_${schema_name}users(
      objects: [$user]
    ) {
      affected_rows
    }
  }
  `;

  try {
    await graphql_client.request(query, {
      user: {
        username,
        password: password_hash,
        secret_token: uuidv4(),
        active: USER_REGISTRATION_AUTO_ACTIVE,
      },
    });
  } catch (e) {
    let isDuplicateError = e.response.errors.filter(({ extensions: { code }}) => code === 'constraint-violation').length > 0
    if (isDuplicateError) {
      return next(Boom.badRequest('User already exist'));
    }
    return next(Boom.badImplementation('Unable to create user.'));
  }

  res.send('OK');
});


router.post('/logout', async(req, res, next) => {
  res.cookie('refresh_token', "", {
    httpOnly: true,
    expires: new Date(0)
  });
  res.send('OK');
})

router.post('/login', async (req, res, next) => {

  // validate username and password
  const schema = Joi.object().keys({
    username: Joi.string().required(),
    password: Joi.string().required(),
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    return next(Boom.badRequest(error.details[0].message));
  }

  const { username, password } = value;

  let query = `
  query (
    $username: String!
  ) {
    ${schema_name}users (
      where: {
        username: { _eq: $username}
      }
    ) {
      id
      password
      active
      default_role
      roles: users_x_roles {
        role
      }
      ${USER_FIELDS.join('\n')}
    }
  }
  `;

  let hasura_data;
  try {
    hasura_data = await graphql_client.request(query, {
      username,
    });
  } catch (e) {
    console.error(e);
    // console.error('Error connection to GraphQL');
    return next(Boom.unauthorized("Unable to find 'user'"));
  }

  if (hasura_data[`${schema_name}users`].length === 0) {
    // console.error("No user with this 'username'");
    return next(Boom.unauthorized("Invalid 'username' or 'password'"));
  }

  // check if we got any user back
  const user = hasura_data[`${schema_name}users`][0];

  // see if password hashes matches
  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    console.error('Password does not match');
    return next(Boom.unauthorized("Invalid 'username' or 'password'"));
  }
  console.warn('user: ' + JSON.stringify(user, null, 2));

  const jwt_token = auth_tools.generateJwtToken(user);
  const jwt_token_expiry = new Date(new Date().getTime() + (JWT_TOKEN_EXPIRES * 60 * 1000));

  // generate refresh token and put in database
  query = `
  mutation (
    $refresh_token_data: ${schema_name}refresh_tokens_insert_input!
  ) {
    insert_${schema_name}refresh_tokens (
      objects: [$refresh_token_data]
    ) {
      affected_rows
    }
  }
  `;

  const refresh_token = uuidv4();
  try {
    await graphql_client.request(query, {
      refresh_token_data: {
        user_id: user.id,
        refresh_token: refresh_token,
        expires_at: new Date(new Date().getTime() + (REFRESH_TOKEN_EXPIRES * 60 * 1000)), // convert from minutes to milli seconds
      },
    });
  } catch (e) {
    console.error(e);
    return next(Boom.badImplementation("Could not update 'refresh token' for user"));
  }

  res.cookie('refresh_token', refresh_token, {
    maxAge: REFRESH_TOKEN_EXPIRES * 60 * 1000, // convert from minute to milliseconds
    httpOnly: true,
    secure: false
  });

  // return jwt token and refresh token to client
  res.json({
    jwt_token,
    refresh_token,
    jwt_token_expiry
  });
});

router.post('/refresh-token', async (req, res, next) => {

  // validate username and password

  const refresh_token = req.cookies['refresh_token'];

  let query = `
  query get_refresh_token(
    $refresh_token: uuid!
  ) {
    ${schema_name}refresh_tokens (
      where: {
        refresh_token: { _eq: $refresh_token }
      }
    ) {
      user {
        id
        default_role
        roles: users_x_roles {
          role
        }
        ${USER_FIELDS.join('\n')}
      }
    }
  }
  `;

  let hasura_data;
  try {
    hasura_data = await graphql_client.request(query, {
      refresh_token
    });
  } catch (e) {
    console.error(e);
    return next(Boom.unauthorized("Invalid refresh token request"));
  }

  if (hasura_data[`${schema_name}refresh_tokens`].length === 0) {
    return next(Boom.unauthorized("invalid refresh token"));
  }

  const user = hasura_data[`${schema_name}refresh_tokens`][0].user;
  const user_id = user.id

  // delete current refresh token and generate a new, and insert the
  // new refresh_token in the database
  // two mutations as transaction
  query = `
  mutation (
    $old_refresh_token: uuid!,
    $new_refresh_token_data: ${schema_name}refresh_tokens_insert_input!
    $user_id: Int!
  ) {
    delete_${schema_name}refresh_tokens (
      where: {
        _and: [{
          refresh_token: { _eq: $old_refresh_token }
        }, {
          user_id: { _eq: $user_id }
        }]
      }
    ) {
      affected_rows
    }
    insert_${schema_name}refresh_tokens (
      objects: [$new_refresh_token_data]
    ) {
      affected_rows
    }
  }
  `;

  const new_refresh_token = uuidv4();
  try {
    await graphql_client.request(query, {
      old_refresh_token: refresh_token,
      new_refresh_token_data: {
        user_id: user_id,
        refresh_token: new_refresh_token,
        expires_at: new Date(new Date().getTime() + (REFRESH_TOKEN_EXPIRES * 60 * 1000)), // convert from minutes to milli seconds
      },
      user_id,
    });
  } catch (e) {
    console.error(e);
    // console.error('unable to create new refresh token and delete old');
    return next(Boom.unauthorized("Invalid 'refresh_token' or 'user_id'"));
  }

  // generate new jwt token
  const jwt_token = auth_tools.generateJwtToken(user);
  const jwt_token_expiry = new Date(new Date().getTime() + (JWT_TOKEN_EXPIRES * 60 * 1000));

  res.cookie('refresh_token', new_refresh_token, {
    maxAge: REFRESH_TOKEN_EXPIRES * 60 * 1000, // convert from minute to milliseconds
    httpOnly: true,
    secure: false
  });

  res.json({
    jwt_token,
    jwt_token_expiry,
    refresh_token: new_refresh_token,
    refresh_token_expiry: REFRESH_TOKEN_EXPIRES * 60 * 1000,
    user_id,
  });
});

module.exports = router;
