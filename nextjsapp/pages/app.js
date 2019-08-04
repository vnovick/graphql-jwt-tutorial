import React from 'react'
import Router from 'next/router'
import fetch from 'isomorphic-unfetch'
import Layout from '../components/layout'
import { withAuthSync } from '../utils/auth'

const App = ({ token }) => {

  return (
    <Layout>
      <h1>{token}</h1>
    </Layout>
  )
}

export default withAuthSync(App)
