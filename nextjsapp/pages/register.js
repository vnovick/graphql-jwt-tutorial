import React, { useState } from 'react'
import fetch from 'isomorphic-unfetch'
import Layout from '../components/layout'
import { login } from '../utils/auth'
import Router from 'next/router'
import { withHostname } from '../utils/ctxWrapper'

function Register ({ hostname }) {
  const [userData, setUserData] = useState({ username: '', password: '', error: '' })

  async function handleSubmit (event) {
    event.preventDefault()
    setUserData({
      ...userData,
      error: ''
    })

    const { username, password } = userData
    const url = `${hostname}/api/register`

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
        alert("Success")
        Router.push('/login')
      } else {
        const rsp = await response.json()
        console.log('Register failed.', rsp)
        // https://github.com/developit/unfetch#caveats
        let error = new Error(rsp.message)
        error.response = rsp
        throw error
      }
    } catch (error) {
      console.error(
        'You have an error in your code or there are Network issues.',
        error
      )

      const { response } = error
      console.log(response)
      setUserData(
        Object.assign({}, userData, {
          error: response ? response.message : error.message
        })
      )
    }
  }

  return (
    <Layout>
      <div className='login'>
        <form onSubmit={handleSubmit}>
          <label htmlFor='username'>Register</label>

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

          <button type='submit'>Register</button>

          {userData.error && <p className='error'>Error: {userData.error}</p>}
        </form>
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

export default withHostname(Register)
