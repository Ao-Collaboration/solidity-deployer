import { Network, Tenderly } from '@tenderly/sdk'
import { config as dotenvConfig } from 'dotenv'
import { TenderlyVerifier } from '../../src/verifiers/TenderlyVerifier'
import { COUNTER_ADDR_SEPOLIA, COUNTER_SOURCE } from '../utils/counter'

dotenvConfig()

describe('TenderlyVerifier', () => {
  let verifier: TenderlyVerifier

  let addStub: jest.SpyInstance
  let verifyStub: jest.SpyInstance

  beforeAll(async () => {
    let tenderly: Tenderly

    if (
      process.env.TENDERLY_ACCESS_KEY === undefined ||
      process.env.TENDERLY_ACCOUNT_NAME === undefined ||
      process.env.TENDERLY_PROJECT_NAME === undefined
    ) {
      console.log('Tenderly configuration not found, using stubs')
      // Stub tenderly
      tenderly = new Tenderly({
        accessKey: 'ABC',
        accountName: 'DEF',
        projectName: 'GHI',
        network: Network.SEPOLIA,
      })
      addStub = jest.spyOn(tenderly.contracts, 'add').mockImplementation()
      verifyStub = jest.spyOn(tenderly.contracts, 'verify').mockImplementation()
    } else {
      // Do it for real. Requires manual review on Tenderly
      console.log('Tenderly configuration found, using real API for tests')
      tenderly = new Tenderly({
        accessKey: process.env.TENDERLY_ACCESS_KEY,
        accountName: process.env.TENDERLY_ACCOUNT_NAME,
        projectName: process.env.TENDERLY_PROJECT_NAME,
        network: Network.SEPOLIA,
      })
    }
    verifier = new TenderlyVerifier(tenderly)
  })

  describe('Tenderly Verification', () => {
    afterEach(async () => {
      jest.restoreAllMocks()
    })

    it('verifies Tenderly source', async () => {
      await verifier.verifyContract(COUNTER_ADDR_SEPOLIA, 'Counter.sol', {
        config: {
          mode: 'public',
        },
        contractToVerify: 'Counter.sol:CounterWithLogs',
        solc: {
          version: 'v0.8.18',
          sources: {
            'Counter.sol': {
              content: COUNTER_SOURCE,
            },
          },
          settings: {
            libraries: {},
            optimizer: {
              enabled: false,
            },
          },
        },
      })

      // Check
      if (addStub) {
        expect(addStub).toHaveBeenCalledTimes(1)
      }
      if (verifyStub) {
        expect(verifyStub).toHaveBeenCalledTimes(1)
      }
    })
  })
})
