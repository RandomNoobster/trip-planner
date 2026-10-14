import type { RouteObject } from 'react-router'
import { NotFound, RootLayout, RouteError } from './components/Layout'
import { ComparePane } from './pages/ComparePane'
import { DealsPage } from './pages/DealsPage'
import { ExploreLayout } from './pages/ExploreLayout'
import { ResearchPage } from './pages/ResearchPage'
import { RoutesPane } from './pages/RoutesPane'
import { TripPane } from './pages/TripPane'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteError />,
    children: [
      {
        // map and side pane stay mounted; the pane switches between the routes list and one route
        element: <ExploreLayout />,
        children: [
          { index: true, element: <RoutesPane /> },
          { path: 'trip/:tripId', element: <TripPane /> },
          { path: 'compare', element: <ComparePane /> },
        ],
      },
      { path: 'deals', element: <DealsPage /> },
      { path: 'research', element: <ResearchPage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]
