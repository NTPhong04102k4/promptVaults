import { type Href, router, useLocalSearchParams } from 'expo-router'

import { type RouteName, type RouteParams, ROUTES } from './routes'

// No params → no second argument; all-optional params → optional; otherwise required.
type ParamsArg<R extends RouteName> = RouteParams[R] extends undefined
  ? []
  : object extends RouteParams[R]
    ? [params?: RouteParams[R]]
    : [params: RouteParams[R]]

export function toHref<R extends RouteName>(route: R, ...[params]: ParamsArg<R>): Href {
  const pathname = ROUTES[route]
  return (params ? { pathname, params } : pathname) as Href
}

// Go to a route, reusing it if it's already in the stack.
export function navigate<R extends RouteName>(route: R, ...params: ParamsArg<R>) {
  router.navigate(toHref(route, ...params))
}

// Always add a new entry on top of the stack.
export function push<R extends RouteName>(route: R, ...params: ParamsArg<R>) {
  router.push(toHref(route, ...params))
}

// Swap the current screen (no back to it).
export function replace<R extends RouteName>(route: R, ...params: ParamsArg<R>) {
  router.replace(toHref(route, ...params))
}

// Clear the stack back to its root, then show `route` (e.g. after sign-in / sign-out).
export function resetTo<R extends RouteName>(route: R, ...params: ParamsArg<R>) {
  if (router.canDismiss()) router.dismissAll()
  router.replace(toHref(route, ...params))
}

// Back if possible, otherwise go to `fallback` (deep-linked screens have no history).
export function goBack(fallback: RouteName = 'home') {
  if (router.canGoBack()) router.back()
  else router.replace(ROUTES[fallback] as Href)
}

// Typed read of the current route's params.
export function useRouteParams<R extends RouteName>(_route: R) {
  return useLocalSearchParams<NonNullable<RouteParams[R]>>()
}

// Route-name constants, e.g. `push(Router.welcome)` instead of `push('welcome')`.
export const Router = Object.fromEntries(
  (Object.keys(ROUTES) as RouteName[]).map((route) => [route, route]),
) as { [R in RouteName]: R }
