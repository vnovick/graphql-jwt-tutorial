import { GraphQLClient } from 'graphql-request';


const { HASURA_GRAPHQL_ENDPOINT, HASURA_GRAPHQL_ADMIN_SECRET } = process.env

export const graphql_client = new GraphQLClient('https://graphql-jwt-tutorial.herokuapp.com/v1/graphql ', {
  headers: {
    'Content-Type': 'application/json',
    'x-hasura-admin-secret': 'graphql-jwt-secret',
  },
});