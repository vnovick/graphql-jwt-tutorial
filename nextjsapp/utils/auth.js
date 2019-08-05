import { Component, useState, useEffect } from 'react'
import Router from 'next/router'
import nextCookie from 'next-cookies'
import cookie from 'js-cookie'
import nodeCookie from 'cookie'

let inMemoryToken;


function login ({ jwt_token, jwt_token_expiry,  refetch_token }, ctx) {
  cookie.set('refetch_token', refetch_token, { expires: 1 })
  inMemoryToken = {
    token: jwt_token,
    expiry: jwt_token_expiry
  };
  
  if (ctx && ctx.req) {
    ctx.res.writeHead(302, { 
      Location: '/app',
      'Set-Cookie':`refetch_token=${refetch_token}; expires=${+new Date(new Date().getTime()+86409000).toUTCString()}`
    })
    ctx.res.end()
  }
  Router.push('/app')
}

function logout () {
  cookie.remove('refetch_token')
  inMemoryToken = null;
  // to support logging out from all windows
  window.localStorage.setItem('logout', Date.now())
  Router.push('/login')
}

// Gets the display name of a JSX component for dev tools
const getDisplayName = Component =>
  Component.displayName || Component.name || 'Component'

function withAuthSync (WrappedComponent) {

  return class extends Component {

    static displayName = `withAuthSync(${getDisplayName(WrappedComponent)})`

    static async getInitialProps (ctx) {
      const token = await auth(ctx)
      if (!inMemoryToken) {
        inMemoryToken = token;
      }
      const componentProps =
        WrappedComponent.getInitialProps &&
        (await WrappedComponent.getInitialProps(ctx))

      return { ...componentProps, accessToken: inMemoryToken }
    }


    constructor (props) {
      super(props)
      this.syncLogout = this.syncLogout.bind(this)
    }

    async componentDidMount () {
      await auth();
      this.interval = setInterval(() => {
        if (inMemoryToken){
          console.log("Expiry date vs current date", new Date(inMemoryToken.expiry).toUTCString(), new Date(new Date().getTime()).toUTCString())
          if (
            new Date(inMemoryToken.expiry).toUTCString() <= 
            new Date(new Date().getTime()).toUTCString()
            ) {
            console.log("Silent refresh")
            inMemoryToken = null;
            auth()
          }
        }
      }, 60000);

      window.addEventListener('storage', this.syncLogout)
    }

    componentWillUnmount () {
      window.removeEventListener('storage', this.syncLogout)
      window.localStorage.removeItem('logout')
    }

    syncLogout (event) {
      if (event.key === 'logout') {
        console.log('logged out from storage!')
        Router.push('/login')
      }
    }

    render () {
      return <WrappedComponent {...this.props} />
    }
  }
}

async function auth(ctx) {
  const { refetch_token } = nextCookie(ctx)
  /*
   * If `ctx.req` is available it means we are on the server.
   * Additionally if there's no token it means the user is not logged in.
   */
  if (!inMemoryToken) {
    console.log("no in memory token")
    //silent token refetch if refetch token present in cookie
    if (refetch_token) {
      const url = 'http://localhost:3010/auth/refetch-token'
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          },
          body: JSON.stringify({ refetch_token })
        })
        if (response.status === 200) {
          const { jwt_token, refetch_token, jwt_token_expiry } = await response.json()
          await login({ jwt_token, refetch_token, jwt_token_expiry }, ctx)
        } else {
          let error = new Error(response.statusText)
          error.response = response
          throw error
        }
      } catch (error) {
        if(ctx.req) {
          ctx.res.writeHead(302, { Location: '/login' })
          ctx.res.end()
        }
        console.log(error)
        Router.push('/login')
      }
    }
  }

  // We already checked for server. This should only happen on client.
  const jwt_token = inMemoryToken;
  if (!jwt_token) {
    Router.push('/login')
  }

  return jwt_token
}

export { login, logout, withAuthSync, auth }
