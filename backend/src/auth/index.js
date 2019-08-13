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
  REFETCH_TOKEN_EXPIRES,
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

  // check for duplicates
  let query = `
  query (
    $username: String!
  ) {
    ${schema_name}users (
      where: {
        username: { _eq: $username }
      }
    ) {
      id
    }
  }
  `;

  try {
    hasura_data = await graphql_client.request(query, {
      username,
    });
  } catch (e) {
    console.error(e);
    return next(Boom.badImplementation("Unable to check for 'username' duplication"));
  }

  if (hasura_data[`${schema_name}users`].length !== 0) {
    return next(Boom.unauthorized("The 'username' is already exist"));
  }

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
    console.error(e);
    return next(Boom.badImplementation('Unable to create user.'));
  }

  res.send('OK');
});

router.post('/new-password', async (req, res, next) => {
  let hasura_data;
  let password_hash;

  const schema = Joi.object().keys({
    secret_token: Joi.string().uuid({version: ['uuidv4']}).required(),
    password: Joi.string().required(),
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    return next(Boom.badRequest(error.details[0].message));
  }

  const {
    secret_token,
    password,
  } = value;

  // update password and username activation token
  try {
    password_hash = await bcrypt.hash(password, 10);
  } catch(e) {
    console.error(e);
    return next(Boom.badImplementation(`Unable to generate 'password_hash'`));
  }

  const query = `
  mutation  (
    $secret_token: uuid!,
    $password_hash: String!,
    $new_secret_token: uuid!
  ) {
    update_${schema_name}users (
      where: {
        secret_token: { _eq: $secret_token}
      }
      _set: {
        password: $password_hash,
        secret_token: $new_secret_token
      }
    ) {
      affected_rows
    }
  }
  `;

  try {
    const new_secret_token = uuidv4();
    hasura_data = await graphql_client.request(query, {
      secret_token,
      password_hash,
      new_secret_token,
    });
  } catch (e) {
    console.error(e);
    return next(Boom.unauthorized(`Unable to update 'password'`));
  }


  if (hasura.update_users.affected_rows === 0) {
    console.log('0 affected rows');
    return next(Boom.badImplementation(`Unable to update password for user`));
  }

  // return 200 OK
  res.send('OK');
});

router.post('/logout', async(req, res, next) => {
  res.cookie('refetch_token', "", {
    httpOnly: true,
    expires: new Date(0)
  });
  res.send('OK');
})

router.post('/login', async (req, res, next) => {
  console.log(req.cookies)

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

  // if (!user.active) {
  //   // console.error('User not activated');
  //   return next(Boom.unauthorized('User not activated.'));
  // }

  // see if password hashes matches
  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    console.error('Password does not match');
    return next(Boom.unauthorized("Invalid 'username' or 'password'"));
  }
  console.warn('user: ' + JSON.stringify(user, null, 2));

  const jwt_token = auth_tools.generateJwtToken(user);
  const jwt_token_expiry = new Date(new Date().getTime() + (JWT_TOKEN_EXPIRES * 60 * 1000));

  // generate refetch token and put in database
  query = `
  mutation (
    $refetch_token_data: ${schema_name}refetch_tokens_insert_input!
  ) {
    insert_${schema_name}refetch_tokens (
      objects: [$refetch_token_data]
    ) {
      affected_rows
    }
  }
  `;

  const refetch_token = uuidv4();
  try {
    await graphql_client.request(query, {
      refetch_token_data: {
        user_id: user.id,
        refetch_token: refetch_token,
        expires_at: new Date(new Date().getTime() + (REFETCH_TOKEN_EXPIRES * 60 * 1000)), // convert from minutes to milli seconds
      },
    });
  } catch (e) {
    console.error(e);
    return next(Boom.badImplementation("Could not update 'refetch token' for user"));
  }

  res.cookie('refetch_token', refetch_token, {
    maxAge: REFETCH_TOKEN_EXPIRES * 60 * 1000, // convert from minute to milliseconds
    httpOnly: true,
    secure: false
  });

  // return jwt token and refetch token to client
  res.json({
    jwt_token,
    refetch_token,
    jwt_token_expiry
  });
});

router.post('/refetch-token', async (req, res, next) => {

  console.log(req.cookies)
  console.log(req.headers)
  // validate username and password

  const refetch_token = req.cookies['refetch_token'];

  let query = `
  query get_refetch_token(
    $refetch_token: uuid!
  ) {
    ${schema_name}refetch_tokens (
      where: {
        refetch_token: { _eq: $refetch_token }
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
      refetch_token
    });
  } catch (e) {
    console.error(e);
    return next(Boom.unauthorized("Invalid refetch token request"));
  }

  if (hasura_data[`${schema_name}refetch_tokens`].length === 0) {
    return next(Boom.unauthorized("invalid refetch token"));
  }

  const user = hasura_data[`${schema_name}refetch_tokens`][0].user;
  const user_id = user.id

  // delete current refetch token and generate a new, and insert the
  // new refetch_token in the database
  // two mutations as transaction
  query = `
  mutation (
    $old_refetch_token: uuid!,
    $new_refetch_token_data: refetch_tokens_insert_input!
    $user_id: Int!
  ) {
    delete_${schema_name}refetch_tokens (
      where: {
        _and: [{
          refetch_token: { _eq: $old_refetch_token }
        }, {
          user_id: { _eq: $user_id }
        }]
      }
    ) {
      affected_rows
    }
    insert_${schema_name}refetch_tokens (
      objects: [$new_refetch_token_data]
    ) {
      affected_rows
    }
  }
  `;

  const new_refetch_token = uuidv4();
  try {
    await graphql_client.request(query, {
      old_refetch_token: refetch_token,
      new_refetch_token_data: {
        user_id: user_id,
        refetch_token: new_refetch_token,
        expires_at: new Date(new Date().getTime() + (REFETCH_TOKEN_EXPIRES * 60 * 1000)), // convert from minutes to milli seconds
      },
      user_id,
    });
  } catch (e) {
    console.error(e);
    // console.error('unable to create new refetch token and delete old');
    return next(Boom.unauthorized("Invalid 'refetch_token' or 'user_id'"));
  }

  // generate new jwt token
  const jwt_token = auth_tools.generateJwtToken(user);
  const jwt_token_expiry = new Date(new Date().getTime() + (JWT_TOKEN_EXPIRES * 60 * 1000));

  res.cookie('refetch_token', new_refetch_token, {
    maxAge: REFETCH_TOKEN_EXPIRES * 60 * 1000, // convert from minute to milliseconds
    httpOnly: true,
    secure: false
  });

  res.json({
    jwt_token,
    jwt_token_expiry,
    refetch_token: new_refetch_token,
    user_id,
  });
});

module.exports = router;
