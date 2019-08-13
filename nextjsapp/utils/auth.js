import { Component, useState, useEffect } from 'react'
import Router from 'next/router'
import nextCookie from 'next-cookies'
import cookie from 'js-cookie'
import nodeCookie from 'cookie'

let inMemoryToken;


function login ({ jwt_token, jwt_token_expiry }, noRedirect) {
  inMemoryToken = {
    token: jwt_token,
    expiry: jwt_token_expiry
  };
  if (!noRedirect) {
    Router.push('/app')
  }
}

async function logout () {
  inMemoryToken = null;
  const url = 'http://localhost:3010/auth/logout'
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
  })

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

    const headers = ctx && ctx.req ? {
      'Cookie': ctx.req.headers.cookie
    } : {}
      const url = 'http://localhost:3010/auth/refetch-token'
      try {
        const response = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            ...headers
          },
        })
        if (response.status === 200) {
          const { jwt_token, refetch_token, jwt_token_expiry } = await response.json()
          // setup httpOnly cookie if SSR
          if (ctx && ctx.req) {
            ctx.res.setHeader('Set-Cookie',`refetch_token=${refetch_token};HttpOnly`);
          }
          await login({ jwt_token, jwt_token_expiry }, true)
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
        Router.push('/login')
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
