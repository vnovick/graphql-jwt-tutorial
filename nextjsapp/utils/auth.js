import { Component } from 'react'
import Router from 'next/router'
import nextCookie from 'next-cookies'
import cookie from 'js-cookie'
import nodeCookie from 'cookie'

let inMemoryToken;


function login ({ jwt_token, refetch_token }, ctx) {
  cookie.set('refetch_token', refetch_token, { expires: 1 })
  inMemoryToken = jwt_token;
  if (ctx && ctx.req) {
    ctx.res.setHeader('Set-Cookie',nodeCookie.serialize('refetch_token', refetch_token));
    ctx.res.writeHead(302, { Location: '/app' })
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
      console.log("In memory token", inMemoryToken)
      const componentProps =
        WrappedComponent.getInitialProps &&
        (await WrappedComponent.getInitialProps(ctx))

      return { ...componentProps, token: inMemoryToken }
    }

    constructor (props) {
      super(props)
      this.syncLogout = this.syncLogout.bind(this)
    }

    componentDidMount () {
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
      console.log(refetch_token)
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
          const { jwt_token, refetch_token } = await response.json()
          await login({ jwt_token, refetch_token }, ctx)
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
