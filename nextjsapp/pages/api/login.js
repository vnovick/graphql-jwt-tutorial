import Joi from 'joi';
import bcrypt from 'bcryptjs';
import uuidv4 from 'uuid/v4';
import auth_tools from '../../utils/backend/auth-tools';
import cookies from '../../utils/backend/cookies';

import {
  USER_FIELDS,
  USER_REGISTRATION_AUTO_ACTIVE,
  USER_MANAGEMENT_DATABASE_SCHEMA_NAME,
  REFRESH_TOKEN_EXPIRES,
  JWT_TOKEN_EXPIRES,
} from '../../utils/backend/config';
import { graphql_client } from '../../utils/backend/graphql-client';

const schema_name = USER_MANAGEMENT_DATABASE_SCHEMA_NAME === 'public' ? '' :  USER_MANAGEMENT_DATABASE_SCHEMA_NAME.toString().toLowerCase() + '_';

const handler = async (req, res) => {
  // validate username and password
  const schema = Joi.object().keys({
    username: Joi.string().required(),
    password: Joi.string().required(),
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    res.status(400).json(error.details[0].message)
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
    res.status(404).json({
      error: {
        message: "Unable to find user"
      }
    })
  }

  if (hasura_data[`${schema_name}users`].length === 0) {
    // console.error("No user with this 'username'");
    res.status(401).json({
      error: {
        message: "Invalid 'username' or 'password'"
      }
    })
  }

  // check if we got any user back
  const user = hasura_data[`${schema_name}users`][0];
  console.log(user)
  // see if password hashes matches
  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    console.error('Password does not match');
    res.status(401).json({
      error: {
        message: "Invalid 'username' or 'password'"
      }
    })
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
    res.status(500).json({
      error: {
        message: "Could not update 'refresh token' for user"
      }
    })
  }

  res.cookie('refresh_token', refresh_token, {
    maxAge: REFRESH_TOKEN_EXPIRES * 60 * 1000, // convert from minute to milliseconds
    httpOnly: true,
    path: '/',
    secure: false
  });

  // return jwt token and refresh token to client

  res.status(200).json({
    jwt_token,
    refresh_token,
    jwt_token_expiry
  });
};

export default cookies(handler)