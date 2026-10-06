import type { FC } from 'react'

/** The piece `mount.tsx` loads lazily — a separate module, so it is a separate request. */
export const Piece: FC<{ label: string }> = ({ label }) => <div id="piece">{label}</div>
