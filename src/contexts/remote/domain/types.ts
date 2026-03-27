export type AuthMethod = 'key' | 'password' | 'agent' | 'keyboard-interactive'

export type DisconnectReason =
  | 'normal'
  | 'auth_failed'
  | 'network_unreachable'
  | 'host_key_mismatch'
  | 'timeout'
  | 'user_cancelled'
  | 'unknown'

export type RemoteTargetSource = 'manual' | 'ssh_config' | 'imported'
