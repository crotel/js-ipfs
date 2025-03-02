/* eslint-env mocha */

import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { concat as uint8ArrayConcat } from 'uint8arrays/concat'
import { nanoid } from 'nanoid'
import all from 'it-all'
import { fixtures } from '../utils/index.js'
import { expect } from 'aegir/utils/chai.js'
import { getDescribe, getIt } from '../utils/mocha.js'
import { identity } from 'multiformats/hashes/identity'
import { CID } from 'multiformats/cid'
import { randomBytes } from 'iso-random-stream'
import { createShardedDirectory } from '../utils/create-sharded-directory.js'
import isShardAtPath from '../utils/is-shard-at-path.js'

/**
 * @typedef {import('ipfsd-ctl').Factory} Factory
 */

/**
 * @param {Factory} factory
 * @param {Object} options
 */
export function testCp (factory, options) {
  const describe = getDescribe(options)
  const it = getIt(options)

  describe('.files.cp', function () {
    this.timeout(120 * 1000)

    /** @type {import('ipfs-core-types').IPFS} */
    let ipfs

    before(async () => { ipfs = (await factory.spawn()).api })

    after(() => factory.clean())

    it('refuses to copy files without a source', async () => {
      // @ts-expect-error invalid args
      await expect(ipfs.files.cp()).to.eventually.be.rejected.with('Please supply at least one source')
    })

    it('refuses to copy files without a source, even with options', async () => {
      // @ts-expect-error invalid args
      await expect(ipfs.files.cp({})).to.eventually.be.rejected.with('Please supply at least one source')
    })

    it('refuses to copy files without a destination', async () => {
      // @ts-expect-error invalid args
      await expect(ipfs.files.cp('/source')).to.eventually.be.rejected.with('Please supply at least one source')
    })

    it('refuses to copy files without a destination, even with options', async () => {
      // @ts-expect-error invalid args
      await expect(ipfs.files.cp('/source', {})).to.eventually.be.rejected.with('Please supply at least one source')
    })

    it('refuses to copy a non-existent file', async () => {
      await expect(ipfs.files.cp('/i-do-not-exist', '/destination', {})).to.eventually.be.rejected.with('does not exist')
    })

    it('refuses to copy multiple files to a non-existent child directory', async () => {
      const src1 = `/src1-${Math.random()}`
      const src2 = `/src2-${Math.random()}`
      const parent = `/output-${Math.random()}`

      await ipfs.files.write(src1, [], {
        create: true
      })
      await ipfs.files.write(src2, [], {
        create: true
      })
      await ipfs.files.mkdir(parent)
      await expect(ipfs.files.cp([src1, src2], `${parent}/child`)).to.eventually.be.rejectedWith(Error)
        .that.has.property('message').that.matches(/destination did not exist/)
    })

    it('refuses to copy files to an unreadable node', async () => {
      const src1 = `/src2-${Math.random()}`
      const parent = `/output-${Math.random()}`

      const hash = await identity.digest(uint8ArrayFromString('derp'))
      const cid = CID.createV1(identity.code, hash)
      await ipfs.block.put(uint8ArrayFromString('derp'), {
        mhtype: 'identity'
      })
      await ipfs.files.cp(`/ipfs/${cid}`, parent)

      await ipfs.files.write(src1, [], {
        create: true
      })

      await expect(ipfs.files.cp(src1, `${parent}/child`)).to.eventually.be.rejectedWith(Error)
        .that.has.property('message').that.matches(/unsupported codec/i)
    })

    it('refuses to copy files to an exsting file', async () => {
      const source = `/source-file-${Math.random()}.txt`
      const destination = `/dest-file-${Math.random()}.txt`

      await ipfs.files.write(source, randomBytes(100), {
        create: true
      })
      await ipfs.files.write(destination, randomBytes(100), {
        create: true
      })

      try {
        await ipfs.files.cp(source, destination)
        throw new Error('No error was thrown when trying to overwrite a file')
      } catch (/** @type {any} */ err) {
        expect(err.message).to.contain('directory already has entry by that name')
      }
    })

    it('refuses to copy a file to itself', async () => {
      const source = `/source-file-${Math.random()}.txt`

      await ipfs.files.write(source, randomBytes(100), {
        create: true
      })

      try {
        await ipfs.files.cp(source, source)
        throw new Error('No error was thrown for a non-existent file')
      } catch (/** @type {any} */ err) {
        expect(err.message).to.contain('directory already has entry by that name')
      }
    })

    it('copies a file to new location', async () => {
      const source = `/source-file-${Math.random()}.txt`
      const destination = `/dest-file-${Math.random()}.txt`
      const data = randomBytes(500)

      await ipfs.files.write(source, data, {
        create: true
      })

      await ipfs.files.cp(source, destination)

      const bytes = uint8ArrayConcat(await all(ipfs.files.read(destination)))

      expect(bytes).to.deep.equal(data)
    })

    it('copies a file to a pre-existing directory', async () => {
      const source = `/source-file-${Math.random()}.txt`
      const directory = `/dest-directory-${Math.random()}`
      const destination = `${directory}${source}`

      await ipfs.files.write(source, randomBytes(500), {
        create: true
      })
      await ipfs.files.mkdir(directory)
      await ipfs.files.cp(source, directory)

      const stats = await ipfs.files.stat(destination)
      expect(stats.size).to.equal(500)
    })

    it('copies directories', async () => {
      const source = `/source-directory-${Math.random()}`
      const destination = `/dest-directory-${Math.random()}`

      await ipfs.files.mkdir(source)
      await ipfs.files.cp(source, destination)

      const stats = await ipfs.files.stat(destination)
      expect(stats.type).to.equal('directory')
    })

    it('copies directories recursively', async () => {
      const directory = `/source-directory-${Math.random()}`
      const subDirectory = `/source-directory-${Math.random()}`
      const source = `${directory}${subDirectory}`
      const destination = `/dest-directory-${Math.random()}`

      await ipfs.files.mkdir(source, {
        parents: true
      })
      await ipfs.files.cp(directory, destination)

      const stats = await ipfs.files.stat(destination)
      expect(stats.type).to.equal('directory')

      const subDirStats = await ipfs.files.stat(`${destination}/${subDirectory}`)
      expect(subDirStats.type).to.equal('directory')
    })

    it('copies multiple files to new location', async () => {
      const sources = [{
        path: `/source-file-${Math.random()}.txt`,
        data: randomBytes(500)
      }, {
        path: `/source-file-${Math.random()}.txt`,
        data: randomBytes(500)
      }]
      const destination = `/dest-dir-${Math.random()}`

      for (const source of sources) {
        await ipfs.files.write(source.path, source.data, {
          create: true
        })
      }

      await ipfs.files.cp([sources[0].path, sources[1].path], destination, {
        parents: true
      })

      for (const source of sources) {
        const bytes = uint8ArrayConcat(await all(ipfs.files.read(`${destination}${source.path}`)))

        expect(bytes).to.deep.equal(source.data)
      }
    })

    it('copies files from ipfs paths', async () => {
      const source = `/source-file-${Math.random()}.txt`
      const destination = `/dest-file-${Math.random()}.txt`

      await ipfs.files.write(source, randomBytes(100), {
        create: true
      })

      const stats = await ipfs.files.stat(source)
      await ipfs.files.cp(`/ipfs/${stats.cid}`, destination)

      const destinationStats = await ipfs.files.stat(destination)
      expect(destinationStats.size).to.equal(100)
    })

    it('copies files from deep ipfs paths', async () => {
      const dir = `dir-${Math.random()}`
      const file = `source-file-${Math.random()}.txt`
      const source = `/${dir}/${file}`
      const destination = `/dest-file-${Math.random()}.txt`

      await ipfs.files.write(source, randomBytes(100), {
        create: true,
        parents: true
      })

      const stats = await ipfs.files.stat(`/${dir}`)
      await ipfs.files.cp(`/ipfs/${stats.cid}/${file}`, destination)

      const destinationStats = await ipfs.files.stat(destination)
      expect(destinationStats.size).to.equal(100)
    })

    it('copies files to deep mfs paths and creates intermediate directories', async () => {
      const source = `/source-file-${Math.random()}.txt`
      const destination = `/really/deep/path/to/dest-file-${Math.random()}.txt`

      await ipfs.files.write(source, randomBytes(100), {
        create: true
      })

      await ipfs.files.cp(source, destination, {
        parents: true
      })

      const destinationStats = await ipfs.files.stat(destination)
      expect(destinationStats.size).to.equal(100)
    })

    it('fails to copy files to deep mfs paths when intermediate directories do not exist', async () => {
      const source = `/source-file-${Math.random()}.txt`
      const destination = `/really/deep/path-${Math.random()}/to-${Math.random()}/dest-file-${Math.random()}.txt`

      await ipfs.files.write(source, randomBytes(100), {
        create: true
      })

      await expect(ipfs.files.cp(source, destination)).to.eventually.be.rejected()
    })

    it('should respect metadata when copying files', async function () {
      const testSrcPath = `/test-${nanoid()}`
      const testDestPath = `/test-${nanoid()}`
      const mode = parseInt('0321', 8)
      const mtime = new Date()
      const seconds = Math.floor(mtime.getTime() / 1000)
      const expectedMtime = {
        secs: seconds,
        nsecs: (mtime.getTime() - (seconds * 1000)) * 1000
      }

      await ipfs.files.write(testSrcPath, uint8ArrayFromString('TEST'), {
        create: true,
        mode,
        mtime
      })
      await ipfs.files.cp(testSrcPath, testDestPath)

      const stats = await ipfs.files.stat(testDestPath)
      expect(stats).to.have.deep.property('mtime', expectedMtime)
      expect(stats).to.have.property('mode', mode)
    })

    it('should respect metadata when copying directories', async function () {
      const testSrcPath = `/test-${nanoid()}`
      const testDestPath = `/test-${nanoid()}`
      const mode = parseInt('0321', 8)
      const mtime = new Date()
      const seconds = Math.floor(mtime.getTime() / 1000)
      const expectedMtime = {
        secs: seconds,
        nsecs: (mtime.getTime() - (seconds * 1000)) * 1000
      }

      await ipfs.files.mkdir(testSrcPath, {
        mode,
        mtime
      })
      await ipfs.files.cp(testSrcPath, testDestPath, {
        recursive: true
      })

      const stats = await ipfs.files.stat(testDestPath)
      expect(stats).to.have.deep.property('mtime', expectedMtime)
      expect(stats).to.have.property('mode', mode)
    })

    it('should respect metadata when copying from outside of mfs', async function () {
      const testDestPath = `/test-${nanoid()}`
      const mode = parseInt('0321', 8)
      const mtime = new Date()
      const seconds = Math.floor(mtime.getTime() / 1000)
      const expectedMtime = {
        secs: seconds,
        nsecs: (mtime.getTime() - (seconds * 1000)) * 1000
      }

      const {
        cid
      } = await ipfs.add({
        content: fixtures.smallFile.data,
        mode,
        mtime
      })
      await ipfs.files.cp(`/ipfs/${cid}`, testDestPath)

      const stats = await ipfs.files.stat(testDestPath)
      expect(stats).to.have.deep.property('mtime', expectedMtime)
      expect(stats).to.have.property('mode', mode)
    })

    describe('with sharding', () => {
      /** @type {import('ipfs-core-types').IPFS} */
      let ipfs

      before(async function () {
        const ipfsd = await factory.spawn({
          ipfsOptions: {
            EXPERIMENTAL: {
              // enable sharding for js
              sharding: true
            },
            config: {
              // enable sharding for go with automatic threshold dropped to the minimum so it shards everything
              Internal: {
                UnixFSShardingSizeThreshold: '1B'
              }
            }
          }
        })
        ipfs = ipfsd.api
      })

      it('copies a sharded directory to a normal directory', async () => {
        const shardedDirPath = await createShardedDirectory(ipfs)

        const normalDir = `dir-${Math.random()}`
        const normalDirPath = `/${normalDir}`

        await ipfs.files.mkdir(normalDirPath)

        await ipfs.files.cp(shardedDirPath, normalDirPath)

        const finalShardedDirPath = `${normalDirPath}${shardedDirPath}`

        // should still be a sharded directory
        await expect(isShardAtPath(finalShardedDirPath, ipfs)).to.eventually.be.true()
        expect((await ipfs.files.stat(finalShardedDirPath)).type).to.equal('directory')

        const files = await all(ipfs.files.ls(finalShardedDirPath))

        expect(files.length).to.be.ok()
      })

      it('copies a normal directory to a sharded directory', async () => {
        const shardedDirPath = await createShardedDirectory(ipfs)

        const normalDir = `dir-${Math.random()}`
        const normalDirPath = `/${normalDir}`

        await ipfs.files.mkdir(normalDirPath)

        await ipfs.files.cp(normalDirPath, shardedDirPath)

        const finalDirPath = `${shardedDirPath}${normalDirPath}`

        // should still be a sharded directory
        await expect(isShardAtPath(shardedDirPath, ipfs)).to.eventually.be.true()
        expect((await ipfs.files.stat(shardedDirPath)).type).to.equal('directory')
        expect((await ipfs.files.stat(finalDirPath)).type).to.equal('directory')
      })

      it('copies a file from a normal directory to a sharded directory', async () => {
        const shardedDirPath = await createShardedDirectory(ipfs)

        const file = `file-${Math.random()}.txt`
        const filePath = `/${file}`
        const finalFilePath = `${shardedDirPath}/${file}`

        await ipfs.files.write(filePath, Uint8Array.from([0, 1, 2, 3]), {
          create: true
        })

        await ipfs.files.cp(filePath, finalFilePath)

        // should still be a sharded directory
        await expect(isShardAtPath(shardedDirPath, ipfs)).to.eventually.be.true()
        expect((await ipfs.files.stat(shardedDirPath)).type).to.equal('directory')
        expect((await ipfs.files.stat(finalFilePath)).type).to.equal('file')
      })

      it('copies a file from a sharded directory to a sharded directory', async () => {
        const shardedDirPath = await createShardedDirectory(ipfs)
        const othershardedDirPath = await createShardedDirectory(ipfs)

        const file = `file-${Math.random()}.txt`
        const filePath = `${shardedDirPath}/${file}`
        const finalFilePath = `${othershardedDirPath}/${file}`

        await ipfs.files.write(filePath, Uint8Array.from([0, 1, 2, 3]), {
          create: true
        })

        await ipfs.files.cp(filePath, finalFilePath)

        // should still be a sharded directory
        await expect(isShardAtPath(shardedDirPath, ipfs)).to.eventually.be.true()
        expect((await ipfs.files.stat(shardedDirPath)).type).to.equal('directory')
        await expect(isShardAtPath(othershardedDirPath, ipfs)).to.eventually.be.true()
        expect((await ipfs.files.stat(othershardedDirPath)).type).to.equal('directory')
        expect((await ipfs.files.stat(finalFilePath)).type).to.equal('file')
      })

      it('copies a file from a sharded directory to a normal directory', async () => {
        const shardedDirPath = await createShardedDirectory(ipfs)
        const dir = `dir-${Math.random()}`
        const dirPath = `/${dir}`

        const file = `file-${Math.random()}.txt`
        const filePath = `${shardedDirPath}/${file}`
        const finalFilePath = `${dirPath}/${file}`

        await ipfs.files.write(filePath, Uint8Array.from([0, 1, 2, 3]), {
          create: true
        })

        await ipfs.files.mkdir(dirPath)

        await ipfs.files.cp(filePath, finalFilePath)

        // should still be a sharded directory
        await expect(isShardAtPath(shardedDirPath, ipfs)).to.eventually.be.true()
        expect((await ipfs.files.stat(shardedDirPath)).type).to.equal('directory')
        expect((await ipfs.files.stat(dirPath)).type).to.equal('directory')
        expect((await ipfs.files.stat(finalFilePath)).type).to.equal('file')
      })
    })
  })
}
