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
    res.status(401).json({
      error: {
        message: "Invalid refresh token request"
      }
    })
  }

  if (hasura_data[`${schema_name}refresh_tokens`].length === 0) {
    res.status(401).json({
      error: {
        message: "Invalid refresh token"
      }
    })
  }

  const user = hasura_data[`${schema_name}refresh_tokens`][0].user;
  const user_id = user.id

  // delete current refresh token and generate a new, and insert the
  // new refresh_token in the database
  // two mutations as transaction
  query = `
  mutation (
    $old_refresh_token: uuid!,
    $new_refresh_token_data: refresh_tokens_insert_input!
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
    res.status(401).json({
      error: {
        message: "Invalid 'refresh_token' or 'user_id'"
      }
    })
  }

  // generate new jwt token
  const jwt_token = auth_tools.generateJwtToken(user);
  const jwt_token_expiry = new Date(new Date().getTime() + (JWT_TOKEN_EXPIRES * 60 * 1000));

  res.cookie('refresh_token', new_refresh_token, {
    maxAge: REFRESH_TOKEN_EXPIRES * 60 * 1000, // convert from minute to milliseconds
    httpOnly: true,
    path: '/',
    secure: false
  });

  res.status(200).json({
    jwt_token,
    jwt_token_expiry,
    refresh_token: new_refresh_token,
    refresh_token_expiry: REFRESH_TOKEN_EXPIRES * 60 * 1000,
    user_id,
  });
};

export default cookies(handler);