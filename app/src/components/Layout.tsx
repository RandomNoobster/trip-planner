import { Suspense } from 'react'
import { Link, Outlet, isRouteErrorResponse, useRouteError } from 'react-router'
import { ResearchProvider } from '../data/research'
import { FreshnessBanner, Header } from './Header'

function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      Loading the research set…
    </div>
  )
}

/** The window never scrolls: header on top, and each page fills the rest and scrolls inside itself if it must. */
export function RootLayout() {
  return (
    <Suspense fallback={<Loading />}>
      <ResearchProvider>
        <div className="app">
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <Header />
          <FreshnessBanner />
          <div className="app__main">
            <Outlet />
          </div>
        </div>
      </ResearchProvider>
    </Suspense>
  )
}

export function RouteError() {
  const err = useRouteError()
  const message = isRouteErrorResponse(err) ? `${err.status} ${err.statusText}` : err instanceof Error ? err.message : String(err)
  return (
    <main className="page" id="main">
      <div className="card empty" role="alert">
        <h1>Something went wrong</h1>
        <p>{message}</p>
        <p>
          <Link to="/">Back to the start</Link>
        </p>
      </div>
    </main>
  )
}

export function NotFound() {
  return (
    <main className="page" id="main">
      <div className="card empty">
        <h1>Page not found</h1>
        <p>
          <Link to="/">Back to the map</Link>
        </p>
      </div>
    </main>
  )
}
