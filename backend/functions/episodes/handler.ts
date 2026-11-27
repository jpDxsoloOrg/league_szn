import { handler as getPublishedEpisodesHandler } from './getPublishedEpisodes';
import { handler as getEpisodeHandler } from './getEpisode';
import { handler as listEpisodesHandler } from './listEpisodes';
import { handler as createEpisodeHandler } from './createEpisode';
import { handler as lookupYoutubeHandler } from './lookupYoutube';
import { handler as updateEpisodeHandler } from './updateEpisode';
import { handler as deleteEpisodeHandler } from './deleteEpisode';
import { createRouter, type RouteConfig, STAFF } from '../../lib/router';

export const routes: ReadonlyArray<RouteConfig> = [
  {
    resource: '/episodes',
    method: 'GET',
    handler: getPublishedEpisodesHandler,
    access: 'public',
  },
  {
    resource: '/episodes/{episodeId}',
    method: 'GET',
    handler: getEpisodeHandler,
    access: 'public',
  },
  {
    resource: '/admin/episodes',
    method: 'GET',
    handler: listEpisodesHandler,
    access: STAFF,
  },
  {
    resource: '/admin/episodes',
    method: 'POST',
    handler: createEpisodeHandler,
    access: STAFF,
  },
  {
    resource: '/admin/episodes/youtube-lookup',
    method: 'POST',
    handler: lookupYoutubeHandler,
    access: STAFF,
  },
  {
    resource: '/admin/episodes/{episodeId}',
    method: 'PUT',
    handler: updateEpisodeHandler,
    access: STAFF,
  },
  {
    resource: '/admin/episodes/{episodeId}',
    method: 'DELETE',
    handler: deleteEpisodeHandler,
    access: STAFF,
  },
];

export const handler = createRouter(routes);
