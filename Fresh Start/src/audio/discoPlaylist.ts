/**
 * H7 — Local disco playlist (user-loaded files only).
 */
import type { OfflineTrackAnalysis } from './trackAnalysis';

export interface DiscoPlaylistTrack {
  id: string;
  name: string;
  objectUrl: string;
  /** Retained for re-decode / re-analyze in-session. */
  file: File | null;
  analysis: OfflineTrackAnalysis | null;
  analyzing: boolean;
  error: string | null;
}

export function createPlaylistTrackId(): string {
  return `trk_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function addPlaylistFiles(
  current: DiscoPlaylistTrack[],
  files: File[],
): DiscoPlaylistTrack[] {
  const next = current.slice();
  for (const file of files) {
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|flac)$/i.test(file.name)) {
      continue;
    }
    next.push({
      id: createPlaylistTrackId(),
      name: file.name,
      objectUrl: URL.createObjectURL(file),
      file,
      analysis: null,
      analyzing: false,
      error: null,
    });
  }
  return next;
}

export function removePlaylistTrack(
  current: DiscoPlaylistTrack[],
  id: string,
): DiscoPlaylistTrack[] {
  const track = current.find((t) => t.id === id);
  if (track) URL.revokeObjectURL(track.objectUrl);
  return current.filter((t) => t.id !== id);
}

export function disposePlaylist(tracks: DiscoPlaylistTrack[]): void {
  for (const t of tracks) URL.revokeObjectURL(t.objectUrl);
}

export function playlistFingerprint(tracks: DiscoPlaylistTrack[]): string {
  return tracks.map((t) => `${t.name}:${t.analysis?.frameCount ?? 0}`).join('|');
}
