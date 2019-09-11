import React from 'react'
import Router from 'next/router'
import fetch from 'isomorphic-unfetch'
import Layout from '../components/layout'
import { withAuthSync, getToken, auth, logout } from '../utils/auth'
import ApolloClient from 'apollo-client';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { HttpLink } from 'apollo-link-http';
import { ApolloProvider } from 'react-apollo';
import { ApolloLink, concat } from 'apollo-link';
import { Query } from 'react-apollo';
import gql from 'graphql-tag';
import { onError } from 'apollo-link-error';


const GET_USER = gql`
  query getUser {
    users {
      username
    }
 }`

let appJWTToken

 const httpLink = new HttpLink({uri: 'https://graphql-jwt-tutorial.herokuapp.com/v1/graphql'})

 const logoutLink = onError(({ graphQLErrors, networkError }) => {
   if (graphQLErrors) {
    graphQLErrors.forEach(({ extensions }) => {
      console.log(extensions)
      if (extensions.code === 'invalid-jwt'){
        logout()
      }
    }) 
   }
  if (networkError && networkError.statusCode === 401) logout();
 })

 const authMiddleware = new ApolloLink((operation, forward)=> {
  if (appJWTToken) {
    operation.setContext({
      headers: {
        Authorization: `Bearer ${appJWTToken}`
      }
    });
  } 
  return forward(operation);
 })


const apolloClient = new ApolloClient({
  link: logoutLink.concat(concat(authMiddleware, httpLink)),
  cache: new InMemoryCache(),
});


const App = ({ accessToken }) => {
  let previousToken = appJWTToken;
  appJWTToken = accessToken.token
  return (
    <ApolloProvider client={apolloClient}>
      <Layout>
        <Query query={GET_USER}>
          {({loading, error, data, refetch}) => {
            // refetch if token has changed
            if (!previousToken && (previousToken !== appJWTToken)) {
              refetch()
            }
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
