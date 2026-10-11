import type { CreatorApiClient, CreatorStreamFactory } from './creator-types'
import { CreatorDashboard } from './creator-dashboard'

export function VerticalDashboard({ id, api, streamFactory }: { id: string; api?: CreatorApiClient; streamFactory?: CreatorStreamFactory }) {
  return <CreatorDashboard initialVertical={id} api={api} streamFactory={streamFactory} />
}
