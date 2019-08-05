import React from 'react'
import Router from 'next/router'
import fetch from 'isomorphic-unfetch'
import Layout from '../components/layout'
import { withAuthSync } from '../utils/auth'
import ApolloClient from 'apollo-client';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { HttpLink } from 'apollo-link-http';
import { ApolloProvider } from 'react-apollo';
import { Query } from 'react-apollo';
import gql from 'graphql-tag';
 
const GET_USER = gql`
  query getUser {
    users {
      username
    }
 }`


const createApolloClient = (authToken) => {
  return new ApolloClient({
    link: new HttpLink({
      uri: 'https://graphql-jwt-tutorial.herokuapp.com/v1/graphql',
      headers: {
        Authorization: `Bearer ${authToken}`
      }
    }),
    cache: new InMemoryCache(),
  });
};


const App = ({ accessToken }) => {
  const client = createApolloClient(accessToken.token);
  return (
    <ApolloProvider client={client}>
      <Layout>
        <h1>{accessToken.token}</h1>
        <Query query={GET_USER}>
          {({loading, error, data}) => {
            if (loading) {
              return <div>Loading</div>
            }
            if (error) {
              console.log(error)
              return <div>Error</div>
            }
            return <h1>{`Welcome, ${data.users[0].username}`}</h1>
          }}
        </Query>
      </Layout>
    </ApolloProvider>
  )
}

export default withAuthSync(App)
