import React, { useState } from 'react'
import fetch from 'isomorphic-unfetch'
import Layout from '../components/layout'
import { login, getCurrentPath } from '../utils/auth'
import { withHostname } from '../utils/ctxWrapper'


function Login ({ hostname }) {
  const [userData, setUserData] = useState({ username: '', password: '', error: '' })

  async function handleSubmit (event) {
    event.preventDefault()
    setUserData({
      ...userData,
      error: ''
    })


    const { username, password } = userData
    const url = `${hostname}/api/login`

    try {
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({ username, password })
      })
      if (response.status === 200) {
        const { jwt_token, jwt_token_expiry } = await response.json()
        await login({ jwt_token, jwt_token_expiry })
      } else {
        console.log('Login failed.')
        // https://github.com/developit/unfetch#caveats
        let error = new Error(response.statusText)
        error.response = response
        throw error
      }
    } catch (error) {
      console.error(
        'You have an error in your code or there are Network issues.',
        error
      )

      const { response } = error
      setUserData(
        Object.assign({}, userData, {
          error: response ? response.statusText : error.message
        })
      )
    }
  }

  return (
    <Layout>
      <div className='login'>
        <form onSubmit={handleSubmit}>
          <label htmlFor='username'>Login</label>

          <input
            type='text'
            id='username'
            name='username'
            value={userData.username}
            onChange={event =>
              setUserData({
                ...userData,
                username: event.target.value
              })
            }
          />
          <input
            type='password'
            id='password'
            name='password'
            value={userData.password}
            onChange={event =>
              setUserData({
                ...userData,
                password: event.target.value 
              })
            }
          />

          <button type='submit'>Login</button>

          {userData.error && <p className='error'>Error: {userData.error}</p>}
        </form>
        <a href="/register">Register</a>
      </div>
      <style jsx>{`
        .login {
          max-width: 340px;
          margin: 0 auto;
          padding: 1rem;
          border: 1px solid #ccc;
          border-radius: 4px;
        }

        form {
          display: flex;
          flex-flow: column;
        }

        label {
          font-weight: 600;
        }

        input {
          padding: 8px;
          margin: 0.3rem 0 1rem;
          border: 1px solid #ccc;
          border-radius: 4px;
        }

        .error {
          margin: 0.5rem 0 0;
          color: brown;
        }
      `}</style>
    </Layout>
  )
}

export default withHostname(Login)
