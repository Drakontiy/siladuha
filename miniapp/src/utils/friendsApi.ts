import { DayActivity } from '../types';
import { FriendRequestStatus, SocialState } from '../types/social';
import { DEFAULT_USER_ID, getActiveUser } from './userIdentity';
import { buildApiUrl } from './userStateSync';

type FriendRequestAction = Extract<FriendRequestStatus, 'accepted' | 'declined'>;

const handleResponse = async (response: Response): Promise<any> => {
  if (response.ok) {
    if (response.status === 204) {
      return undefined;
    }
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  let message = `Request failed with status ${response.status}`;
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload?.error) {
      message = payload.error;
    }
  } catch {
    // ignore
  }
  throw new Error(message);
};

const getActiveUserId = (): string => {
  const user = getActiveUser();
  return user.userId ?? DEFAULT_USER_ID;
};

export type SharedUserHomeState = {
  currentStreak: number;
};

export interface SharedUserData {
  activityData: Record<string, DayActivity>;
  homeState: SharedUserHomeState | null;
}

export const sendFriendRequest = async (
  targetUserId: string,
  requesterName?: string | null,
  targetName?: string | null,
): Promise<SocialState> => {
  const userId = getActiveUserId();
  if (!targetUserId || userId === DEFAULT_USER_ID) {
    throw new Error('Недоступно в режиме локального пользователя');
  }

  const response = await fetch(buildApiUrl(`/api/user/${encodeURIComponent(userId)}/friends/request`), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      targetUserId,
      requesterName: requesterName ?? undefined,
      targetName: targetName ?? undefined,
    }),
  });

  const payload = (await handleResponse(response)) as { social: SocialState };
  return payload.social;
};

export const respondToFriendRequest = async (
  requestId: string,
  action: FriendRequestAction,
  responderName?: string | null,
): Promise<SocialState> => {
  const userId = getActiveUserId();
  if (!requestId || userId === DEFAULT_USER_ID) {
    throw new Error('Недоступно в режиме локального пользователя');
  }

  const response = await fetch(
    buildApiUrl(`/api/user/${encodeURIComponent(userId)}/friends/request/${encodeURIComponent(requestId)}/respond`),
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: action === 'accepted' ? 'accept' : 'decline',
        responderName: responderName ?? undefined,
      }),
    },
  );

  const payload = (await handleResponse(response)) as { social: SocialState };
  return payload.social;
};

export const updateFriendSharing = async (friendId: string, shareMyStatsWith: boolean): Promise<SocialState> => {
  const userId = getActiveUserId();
  if (!friendId || userId === DEFAULT_USER_ID) {
    throw new Error('Недоступно в режиме локального пользователя');
  }

  const response = await fetch(
    buildApiUrl(`/api/user/${encodeURIComponent(userId)}/friends/${encodeURIComponent(friendId)}/sharing`),
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        shareMyStatsWith,
      }),
    },
  );

  const payload = (await handleResponse(response)) as { social: SocialState };
  return payload.social;
};

export const fetchSharedUserData = async (targetUserId: string): Promise<SharedUserData> => {
  const viewerId = getActiveUserId();
  if (!targetUserId || viewerId === DEFAULT_USER_ID) {
    throw new Error('Недоступно в режиме локального пользователя');
  }

  const response = await fetch(
    buildApiUrl(
      `/api/user/${encodeURIComponent(targetUserId)}/shared/activity?viewer=${encodeURIComponent(viewerId)}`,
    ),
    {
      method: 'GET',
      credentials: 'include',
    },
  );

  const payload = (await handleResponse(response)) as {
    activityData?: Record<string, DayActivity>;
    homeState?: SharedUserHomeState | null;
  };
  return {
    activityData: payload.activityData ?? {},
    homeState: payload.homeState ?? null,
  };
};

export const removeFriend = async (friendId: string): Promise<SocialState> => {
  const userId = getActiveUserId();
  if (!friendId || userId === DEFAULT_USER_ID) {
    throw new Error('Недоступно в режиме локального пользователя');
  }

  const response = await fetch(buildApiUrl(`/api/user/${encodeURIComponent(userId)}/friends/${encodeURIComponent(friendId)}`), {
    method: 'DELETE',
    credentials: 'include',
  });

  const payload = (await handleResponse(response)) as { social: SocialState };
  return payload.social;
};


