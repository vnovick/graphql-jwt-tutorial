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
  const url = '/api/logout'
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

const subMinutes =  function (dt, minutes) {
    return new Date(dt.getTime() - minutes*60000);
}

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
      this.interval = setInterval(async () => {
        if (inMemoryToken){
          if (
            subMinutes(new Date(inMemoryToken.expiry), 1) <= 
            new Date(inMemoryToken.expiry)
            ) {
            inMemoryToken = null;
            const token = await auth()
            inMemoryToken = token;
          }
        } else {
          const token = await auth()
          inMemoryToken = token;
        }
      }, 60000);

      window.addEventListener('storage', this.syncLogout)
    }

    componentWillUnmount () {
      clearInterval(this.interval)
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
  const { refresh_token } = nextCookie(ctx)

  /*
   * If `ctx.req` is available it means we are on the server.
   * Additionally if there's no token it means the user is not logged in.
   */
  if (!inMemoryToken) {

    const headers = ctx && ctx.req ? {
      'Cookie': ctx.req.headers.cookie
    } : {}
      const hostname = typeof window === 'object' ? `${window.location.protocol}${window.location.host}` : `${ctx.req.headers.referer.split('://')[0]}://${ctx.req.headers.host}`
      const url = ctx && ctx.req ? `${hostname}/api/refresh-token` : '/api/refresh-token'
      console.log(url)
      try {
        const response = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            ...headers
          },
          body: JSON.stringify({})
        })
        if (response.status === 200) {
          const { jwt_token, refresh_token, jwt_token_expiry, refresh_token_expiry } = await response.json()
          // setup httpOnly cookie if SSR
          if (ctx && ctx.req) {
            ctx.res.setHeader('Set-Cookie',`refresh_token=${refresh_token};HttpOnly;Max-Age=${refresh_token_expiry};Path="/"`);
          }
          await login({ jwt_token, jwt_token_expiry }, true)
        } else {
          let error = new Error(response.statusText)
          error.response = response
          throw error
        }
      } catch (error) {
        console.log(error)
        if(ctx && ctx.req) {
          ctx.res.writeHead(302, { Location: '/login' })
          ctx.res.end()
        }
        Router.push('/login')
      }
    }

  const jwt_token = inMemoryToken;

  // We already checked for server. This should only happen on client.
  if (!jwt_token) {
    Router.push('/login')
  }

  return jwt_token
}

function getToken() {
  return inMemoryToken
}

const getCurrentPath = (originalUrl) => {
  if (typeof window === 'object') {
    return window.location.host
  } else {
    return originalUrl
  }
}


export { login, logout, withAuthSync, auth, getToken, getCurrentPath }
