/* eslint-disable @typescript-eslint/ban-ts-comment,@typescript-eslint/prefer-ts-expect-error */
import { type Controller, type ControllerOptions, createController } from 'ipfsd-ctl'
import * as goIpfs from 'kubo'
import * as kuboRpcClient from 'kubo-rpc-client'
import mergeOptions from 'merge-options'
import { isElectronMain, isNode } from 'wherearewe'

export async function createKuboNode (options: ControllerOptions<'go'> = {}): Promise<Controller> {
  const opts = mergeOptions({
    kuboRpcModule: kuboRpcClient,
    ipfsBin: isNode || isElectronMain ? goIpfs.path() : undefined,
    test: true,
    endpoint: process.env.IPFSD_SERVER,
    ipfsOptions: {
      config: {
        Addresses: {
          Swarm: [
            '/ip4/0.0.0.0/tcp/4001',
            '/ip4/0.0.0.0/tcp/4002/ws'
          ]
        },
        Routing: {
          Type: 'none'
        }
      }
    }
  }, options)

  return createController(opts)
}
