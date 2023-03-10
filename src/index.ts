/**
 * @packageDocumentation
 *
 * `@helia/unixfs` is an implementation of a {@link https://github.com/ipfs/specs/blob/main/UNIXFS.md UnixFS filesystem} compatible with {@link https://github.com/ipfs/helia Helia}.
 *
 * See the {@link UnixFS UnixFS interface} for all available operations.
 *
 * @example
 *
 * ```typescript
 * import { createHelia } from 'helia'
 * import { unixfs } from '@helia/unixfs'
 *
 * const helia = createHelia({
 *   // ... helia config
 * })
 * const fs = unixfs(helia)
 *
 * // create an empty dir and a file, then add the file to the dir
 * const emptyDirCid = await fs.addDirectory()
 * const fileCid = await fs.addBytes(Uint8Array.from([0, 1, 2, 3]))
 * const updateDirCid = await fs.cp(fileCid, emptyDirCid, 'foo.txt')
 *
 * // or doing the same thing as a stream
 * for await (const entry of fs.addAll([{
 *   path: 'foo.txt',
 *   content: Uint8Array.from([0, 1, 2, 3])
 * }])) {
 *   console.info(entry)
 * }
 * ```
 */

import type { CID, Version } from 'multiformats/cid'
import type { Blockstore } from 'interface-blockstore'
import type { AbortOptions } from '@libp2p/interfaces'
import { addAll, addBytes, addByteStream, addDirectory, addFile } from './commands/add.js'
import { cat } from './commands/cat.js'
import { mkdir } from './commands/mkdir.js'
import type { Mtime } from 'ipfs-unixfs'
import { cp } from './commands/cp.js'
import { rm } from './commands/rm.js'
import { stat } from './commands/stat.js'
import { touch } from './commands/touch.js'
import { chmod } from './commands/chmod.js'
import type { UnixFSEntry } from 'ipfs-unixfs-exporter'
import { ls } from './commands/ls.js'
import type { ByteStream, DirectoryCandidate, FileCandidate, ImportCandidateStream, ImporterOptions, ImportResult } from 'ipfs-unixfs-importer'

export interface UnixFSComponents {
  blockstore: Blockstore
}

/**
 * Options to pass to the cat command
 */
export interface CatOptions extends AbortOptions {
  /**
   * Start reading the file at this offset
   */
  offset?: number

  /**
   * Stop reading the file after this many bytes
   */
  length?: number

  /**
   * An optional path to allow reading files inside directories
   */
  path?: string
}

/**
 * Options to pass to the chmod command
 */
export interface ChmodOptions extends AbortOptions {
  /**
   * If the target of the operation is a directory and this is true,
   * apply the new mode to all directory contents
   */
  recursive: boolean

  /**
   * Optional path to set the mode on directory contents
   */
  path?: string

  /**
   * DAGs with a root block larger than this value will be sharded. Blocks
   * smaller than this value will be regular UnixFS directories.
   */
  shardSplitThresholdBytes: number
}

/**
 * Options to pass to the cp command
 */
export interface CpOptions extends AbortOptions {
  /**
   * If true, allow overwriting existing directory entries (default: false)
   */
  force: boolean

  /**
   * DAGs with a root block larger than this value will be sharded. Blocks
   * smaller than this value will be regular UnixFS directories.
   */
  shardSplitThresholdBytes: number
}

/**
 * Options to pass to the ls command
 */
export interface LsOptions extends AbortOptions {
  /**
   * Optional path to list subdirectory contents if the target CID resolves to
   * a directory
   */
  path?: string

  /**
   * Start reading the directory entries at this offset
   */
  offset?: number

  /**
   * Stop reading the directory contents after this many directory entries
   */
  length?: number
}

/**
 * Options to pass to the mkdir command
 */
export interface MkdirOptions extends AbortOptions {
  /**
   * The CID version to create the new directory with - defaults to the same
   * version as the containing directory
   */
  cidVersion: Version

  /**
   * If true, allow overwriting existing directory entries (default: false)
   */
  force: boolean

  /**
   * An optional mode to set on the new directory
   */
  mode?: number

  /**
   * An optional mtime to set on the new directory
   */
  mtime?: Mtime

  /**
   * DAGs with a root block larger than this value will be sharded. Blocks
   * smaller than this value will be regular UnixFS directories.
   */
  shardSplitThresholdBytes: number
}

/**
 * Options to pass to the rm command
 */
export interface RmOptions extends AbortOptions {
  /**
   * DAGs with a root block larger than this value will be sharded. Blocks
   * smaller than this value will be regular UnixFS directories.
   */
  shardSplitThresholdBytes: number
}

/**
 * Options to pass to the stat command
 */
export interface StatOptions extends AbortOptions {
  /**
   * An optional path to allow statting paths inside directories
   */
  path?: string
}

/**
 * Statistics relating to a UnixFS DAG
 */
export interface UnixFSStats {
  /**
   * The file or directory CID
   */
  cid: CID

  /**
   * The file or directory mode
   */
  mode?: number

  /**
   * The file or directory mtime
   */
  mtime?: Mtime

  /**
   * The size of the file in bytes
   */
  fileSize: bigint

  /**
   * The size of the DAG that holds the file in bytes
   */
  dagSize: bigint

  /**
   * How much of the file is in the local block store
   */
  localFileSize: bigint

  /**
   * How much of the DAG that holds the file is in the local blockstore
   */
  localDagSize: bigint

  /**
   * How many blocks make up the DAG - nb. this will only be accurate
   * if all blocks are present in the local blockstore
   */
  blocks: number

  /**
   * The type of file
   */
  type: 'file' | 'directory' | 'raw'

  /**
   * UnixFS metadata about this file or directory. Will not be present
   * if the node is a `raw` type.
   */
  unixfs?: import('ipfs-unixfs').UnixFS
}

/**
 * Options to pass to the touch command
 */
export interface TouchOptions extends AbortOptions {
  /**
   * Optional mtime to set on the DAG root, defaults to the current time
   */
  mtime?: Mtime

  /**
   * Optional path to set mtime on directory contents
   */
  path?: string

  /**
   * If the DAG is a directory and this is true, update the mtime on all contents
   */
  recursive: boolean

  /**
   * DAGs with a root block larger than this value will be sharded. Blocks
   * smaller than this value will be regular UnixFS directories.
   */
  shardSplitThresholdBytes: number
}

/**
 * The UnixFS interface provides familiar filesystem operations to make working with
 * UnixFS DAGs simple and intuitive.
 */
export interface UnixFS {
  /**
   * Add all files and directories from the passed stream. This method wraps the
   * `importer` export from the `ipfs-unixfs-importer` module - please see the docs
   * for input/output types.
   *
   * @example
   *
   * ```typescript
   * const source = [{
   *   path: './foo.txt',
   *   content: Uint8Array.from([0, 1, 2, 3])
   * }, {
   *   path: './bar.txt',
   *   content: Uint8Array.from([4, 5, 6, 7])
   * }]
   *
   * for await (const entry of fs.import(source)) {
   *   console.info(entry)
   * }
   * ```
   */
  addAll: (source: ImportCandidateStream, options?: Partial<ImporterOptions>) => AsyncIterable<ImportResult>

  /**
   * Add a single `Uint8Array` to your Helia node as a file.
   *
   * @example
   *
   * ```typescript
   * const cid = await fs.addBytes(Uint8Array.from([0, 1, 2, 3]))
   *
   * console.info(cid)
   * ```
   */
  addBytes: (bytes: Uint8Array, options?: Partial<ImporterOptions>) => Promise<CID>

  /**
   * Add a stream of `Uint8Array` to your Helia node as a file.
   *
   * @example
   *
   * ```typescript
   * import fs from 'node:fs'
   *
   * const stream = fs.createReadStream('./foo.txt')
   * const cid = await fs.addByteStream(stream)
   *
   * console.info(cid)
   * ```
   */
  addByteStream: (bytes: ByteStream, options?: Partial<ImporterOptions>) => Promise<CID>

  /**
   * Add a file to your Helia node with optional metadata.
   *
   * @example
   *
   * ```typescript
   * const cid = await fs.addFile({
   *   path: './foo.txt'
   *   content: Uint8Array.from([0, 1, 2, 3]),
   *   mode: 0x755,
   *   mtime: {
   *     secs: 10n,
   *     nsecs: 0
   *   }
   * })
   *
   * console.info(cid)
   * ```
   */
  addFile: (file: FileCandidate, options?: Partial<ImporterOptions>) => Promise<CID>

  /**
   * Add a directory to your Helia node.
   *
   * @example
   *
   * ```typescript
   * const cid = await fs.addDirectory()
   *
   * console.info(cid)
   * ```
   */
  addDirectory: (dir?: Partial<DirectoryCandidate>, options?: Partial<ImporterOptions>) => Promise<CID>

  /**
   * Retrieve the contents of a file from your Helia node.
   *
   * @example
   *
   * ```typescript
   * for await (const buf of fs.cat(cid)) {
   *   console.info(buf)
   * }
   * ```
   */
  cat: (cid: CID, options?: Partial<CatOptions>) => AsyncIterable<Uint8Array>

  /**
   * Change the permissions on a file or directory in a DAG
   *
   * @example
   *
   * ```typescript
   * const beforeCid = await fs.addBytes(Uint8Array.from([0, 1, 2, 3]))
   * const beforeStats = await fs.stat(beforeCid)
   *
   * const afterCid = await fs.chmod(cid, 0x755)
   * const afterStats = await fs.stat(afterCid)
   *
   * console.info(beforeCid, beforeStats)
   * console.info(afterCid, afterStats)
   * ```
   */
  chmod: (cid: CID, mode: number, options?: Partial<ChmodOptions>) => Promise<CID>

  /**
   * Add a file or directory to a target directory.
   *
   * @example
   *
   * ```typescript
   * const fileCid = await fs.addBytes(Uint8Array.from([0, 1, 2, 3]))
   * const directoryCid = await fs.addDirectory()
   *
   * const updatedCid = await fs.cp(fileCid, directoryCid, 'foo.txt')
   *
   * console.info(updatedCid)
   * ```
   */
  cp: (source: CID, target: CID, name: string, options?: Partial<CpOptions>) => Promise<CID>

  /**
   * List directory contents.
   *
   * @example
   *
   * ```typescript
   * for await (const entry of fs.ls(directoryCid)) {
   *   console.info(etnry)
   * }
   * ```
   */
  ls: (cid: CID, options?: Partial<LsOptions>) => AsyncIterable<UnixFSEntry>

  /**
   * Make a new directory under an existing directory.
   *
   * @example
   *
   * ```typescript
   * const directoryCid = await fs.addDirectory()
   *
   * const updatedCid = await fs.mkdir(directoryCid, 'new-dir')
   *
   * console.info(updatedCid)
   * ```
   */
  mkdir: (cid: CID, dirname: string, options?: Partial<MkdirOptions>) => Promise<CID>

  /**
   * Remove a file or directory from an existing directory.
   *
   * @example
   *
   * ```typescript
   * const directoryCid = await fs.addDirectory()
   * const updatedCid = await fs.mkdir(directoryCid, 'new-dir')
   *
   * const finalCid = await fs.rm(updatedCid, 'new-dir')
   *
   * console.info(finalCid)
   * ```
   */
  rm: (cid: CID, path: string, options?: Partial<RmOptions>) => Promise<CID>

  /**
   * Return statistics about a UnixFS DAG.
   *
   * @example
   *
   * ```typescript
   * const fileCid = await fs.addBytes(Uint8Array.from([0, 1, 2, 3]))
   *
   * const stats = await fs.stat(fileCid)
   *
   * console.info(stats)
   * ```
   */
  stat: (cid: CID, options?: Partial<StatOptions>) => Promise<UnixFSStats>

  /**
   * Update the mtime of a UnixFS DAG
   *
   * @example
   *
   * ```typescript
   * const beforeCid = await fs.addBytes(Uint8Array.from([0, 1, 2, 3]))
   * const beforeStats = await fs.stat(beforeCid)
   *
   * const afterCid = await fs.touch(beforeCid)
   * const afterStats = await fs.stat(afterCid)
   *
   * console.info(beforeCid, beforeStats)
   * console.info(afterCid, afterStats)
   * ```
   */
  touch: (cid: CID, options?: Partial<TouchOptions>) => Promise<CID>
}

class DefaultUnixFS implements UnixFS {
  private readonly components: UnixFSComponents

  constructor (components: UnixFSComponents) {
    this.components = components
  }

  async * addAll (source: ImportCandidateStream, options: Partial<ImporterOptions> = {}): AsyncIterable<ImportResult> {
    yield * addAll(source, this.components.blockstore, options)
  }

  async addBytes (bytes: Uint8Array, options: Partial<ImporterOptions> = {}): Promise<CID> {
    return await addBytes(bytes, this.components.blockstore, options)
  }

  async addByteStream (bytes: ByteStream, options: Partial<ImporterOptions> = {}): Promise<CID> {
    return await addByteStream(bytes, this.components.blockstore, options)
  }

  async addFile (file: FileCandidate, options: Partial<ImporterOptions> = {}): Promise<CID> {
    return await addFile(file, this.components.blockstore, options)
  }

  async addDirectory (dir: Partial<DirectoryCandidate> = {}, options: Partial<ImporterOptions> = {}): Promise<CID> {
    return await addDirectory(dir, this.components.blockstore, options)
  }

  async * cat (cid: CID, options: Partial<CatOptions> = {}): AsyncIterable<Uint8Array> {
    yield * cat(cid, this.components.blockstore, options)
  }

  async chmod (cid: CID, mode: number, options: Partial<ChmodOptions> = {}): Promise<CID> {
    return await chmod(cid, mode, this.components.blockstore, options)
  }

  async cp (source: CID, target: CID, name: string, options: Partial<CpOptions> = {}): Promise<CID> {
    return await cp(source, target, name, this.components.blockstore, options)
  }

  async * ls (cid: CID, options: Partial<LsOptions> = {}): AsyncIterable<UnixFSEntry> {
    yield * ls(cid, this.components.blockstore, options)
  }

  async mkdir (cid: CID, dirname: string, options: Partial<MkdirOptions> = {}): Promise<CID> {
    return await mkdir(cid, dirname, this.components.blockstore, options)
  }

  async rm (cid: CID, path: string, options: Partial<RmOptions> = {}): Promise<CID> {
    return await rm(cid, path, this.components.blockstore, options)
  }

  async stat (cid: CID, options: Partial<StatOptions> = {}): Promise<UnixFSStats> {
    return await stat(cid, this.components.blockstore, options)
  }

  async touch (cid: CID, options: Partial<TouchOptions> = {}): Promise<CID> {
    return await touch(cid, this.components.blockstore, options)
  }
}

/**
 * Create a {@link UnixFS} instance for use with {@link https://github.com/ipfs/helia Helia}
 */
export function unixfs (helia: { blockstore: Blockstore }): UnixFS {
  return new DefaultUnixFS(helia)
}
