import type { CID } from 'multiformts/cid';
import type { AbortOptions, PreloadOptions } from '../utils'
import type { API as PatchAPI } from './patch'
import type { PBNode, PBLink } from '@ipld/dag-pb'

export interface API<OptionExtension = {}> {
  new: (options?: NewObjectOptions & OptionExtension) => Promise<CID>
  put: (obj: DAGNode, options?: AbortOptions & PreloadOptions & OptionExtension) => Promise<CID>
  get: (cid: CID, options?: AbortOptions & PreloadOptions & OptionExtension) => Promise<PBNode>
  data: (cid: CID, options?: AbortOptions & PreloadOptions & OptionExtension) => Promise<Uint8Array>
  links: (cid: CID, options?: AbortOptions & PreloadOptions & OptionExtension) => Promise<PBLink[]>
  stat: (cid: CID, options?: AbortOptions & PreloadOptions & OptionExtension) => Promise<StatResult>

  patch: PatchAPI
}

export interface NewObjectOptions extends AbortOptions, PreloadOptions {
  template?: 'unixfs-dir'
}

export interface StatResult {
  Hash: CID
  NumLinks: number
  BlockSize: number
  LinksSize: number
  DataSize: number
  CumulativeSize: number
}
