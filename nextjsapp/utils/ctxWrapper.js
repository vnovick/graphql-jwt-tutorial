import { Component } from 'react'

const getDisplayName = Component =>
  Component.displayName || Component.name || 'Component'

function withHostname (WrappedComponent) {

  return class extends Component {

    static displayName = `withHostname(${getDisplayName(WrappedComponent)})`

    static async getInitialProps (ctx) {
      const componentProps =
        WrappedComponent.getInitialProps &&
        (await WrappedComponent.getInitialProps(ctx))

      const hostname = typeof window === 'object' ? `${window.location.protocol}${window.location.host}` : `${ctx.req.headers.referer.split('://')[0]}://${ctx.req.headers.host}`
      return { ...componentProps, ...{ hostname } }
    }
    
    render () {
      return <WrappedComponent {...this.props} />
    }
  }
}

export { withHostname }