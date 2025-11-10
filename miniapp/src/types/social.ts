export type FriendRequestDirection = 'incoming' | 'outgoing';
export type FriendRequestStatus = 'pending' | 'accepted' | 'declined';

export interface Friend {
  userId: string;
  displayName?: string | null;
  shareMyStatsWith: boolean;
  shareTheirStatsWithMe: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FriendRequest {
  id: string;
  counterpartId: string;
  counterpartName?: string | null;
  direction: FriendRequestDirection;
  status: FriendRequestStatus;
  createdAt: string;
  respondedAt?: string | null;
}

export type SocialNotificationType = 'friend_request' | 'friend_request_accepted' | 'friend_request_declined';

export interface SocialNotification {
  id: string;
  type: SocialNotificationType;
  message: string;
  createdAt: string;
  read: boolean;
  payload?: Record<string, unknown>;
}

export interface SocialState {
  friends: Friend[];
  friendRequests: FriendRequest[];
  notifications: SocialNotification[];
}

export const DEFAULT_SOCIAL_STATE: SocialState = {
  friends: [],
  friendRequests: [],
  notifications: [],
};


