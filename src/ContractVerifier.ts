import type {
  Tenderly,
  TenderlyConfiguration,
  VerificationRequest,
} from '@tenderly/sdk'
import axios from 'axios'
import type { ContractFactory, Signer, ethers } from 'ethers'
import type { EtherscanVerificationRequest } from './verifiers/EtherscanVerifier'
import { EtherscanVerifier } from './verifiers/EtherscanVerifier'
import { TenderlyVerifier } from './verifiers/TenderlyVerifier'
import type { Logger } from './types/logger'

type SolidityCompilerShortVersion = `v${number}.${number}.${number}`
type SolidityCompilerLongVersion =
  `v${number}.${number}.${number}+commit.${string}`
type SolidityCompilerVersion =
  | SolidityCompilerShortVersion
  | SolidityCompilerLongVersion
type Path = string
type Web3Address = string

export type ContractVerificationRequest = {
  contractToVerify: string
  version: SolidityCompilerVersion
  sources: Record<
    Path,
    {
      // File path to source content
      content: string
    }
  >
  settings: {
    optimizer: {
      enabled: boolean
      runs: number
      details?: {
        yul?: boolean
      }
    }
    libraries?: Record<Path, Record<string, Web3Address>>
    remappings?: string[]
  }
  waitForSuccess: boolean
}

const COMPILERS_LIST_URL = 'https://solc-bin.ethereum.org/bin/list.json'

export class ContractVerifier {
  private readonly tenderlyVerifier: TenderlyVerifier
  private readonly etherscanVerifier: EtherscanVerifier

  constructor(
    tenderly: TenderlyConfiguration | Tenderly,
    etherscanApiKey: string,
    private readonly signer: Signer,
    networkName = 'homestead',
    private readonly logger?: Logger,
  ) {
    this.tenderlyVerifier = new TenderlyVerifier(tenderly)
    this.etherscanVerifier = new EtherscanVerifier(etherscanApiKey, networkName)
  }

  validateBytecode = <T extends ContractFactory>(
    contractFactory: new (signer: ethers.Signer) => T,
    expectedBytecode: string,
  ): void => {
    // Validate contract bytecode
    const factory = new contractFactory(this.signer)
    if (factory.bytecode !== expectedBytecode) {
      throw new Error(`Bytecode mismatch`)
    }
  }

  verifyContract = async (
    address: string,
    verificationRequest: ContractVerificationRequest,
  ): Promise<void> => {
    let shortVersion =
      verificationRequest.version as SolidityCompilerShortVersion
    let longVersion = verificationRequest.version as SolidityCompilerLongVersion
    if (verificationRequest.version.includes('+')) {
      // Long version, get short
      shortVersion = verificationRequest.version.split(
        '+',
      )[0] as SolidityCompilerShortVersion
    } else {
      // Short version, get long
      longVersion = await this.getLongVersion(verificationRequest.version)
    }

    // Construct different verification requests
    const tenderVerificationRequest: VerificationRequest = {
      contractToVerify: verificationRequest.contractToVerify,
      solc: {
        version: shortVersion,
        sources: verificationRequest.sources,
        settings: {
          optimizer: verificationRequest.settings.optimizer,
        },
      },
      config: {
        // Default mode public
        mode: 'public',
      },
    }

    const etherscanVerificationRequest: EtherscanVerificationRequest = {
      contractToVerify: verificationRequest.contractToVerify,
      version: longVersion,
      compilerInput: {
        language: 'Solidity',
        sources: verificationRequest.sources,
        settings: {
          optimizer: verificationRequest.settings.optimizer,
          outputSelection: {
            // Default output selection
            '*': {
              '*': [
                'abi',
                'evm.bytecode',
                'evm.deployedBytecode',
                'evm.methodIdentifiers',
                'metadata',
              ],
              '': ['ast'],
            },
          },
          remappings: verificationRequest.settings.remappings,
        },
      },
      waitForSuccess: verificationRequest.waitForSuccess,
    }

    await this.tenderlyVerifier.verifyContract(
      address,
      verificationRequest.contractToVerify,
      tenderVerificationRequest,
    )
    await this.etherscanVerifier.verifyContract(
      address,
      etherscanVerificationRequest,
    )
  }

  // Based on https://github.com/NomicFoundation/hardhat/blob/08e2d3a8bcc1daced2f24f1dfd6acf00113c6fb5/packages/hardhat-etherscan/src/solc/version.ts
  getLongVersion = async (
    shortVersion: string,
  ): Promise<SolidityCompilerLongVersion> => {
    try {
      // It would be better to query an etherscan API to get this list but there's no such API yet.
      const response = await axios.get(COMPILERS_LIST_URL)

      const responseText = response.data
      if (response.status < 200 || response.status > 299) {
        throw new Error(
          `Unabled to get solidity compiler versions. ${responseText}`,
        )
      }

      const fullVersion = responseText.releases[shortVersion]

      if (fullVersion === undefined || fullVersion === '') {
        throw new Error(
          `Unabled to find full solidity compiler version ${shortVersion}`,
        )
      }

      return fullVersion.replace(
        /(soljson-)(.*)(.js)/,
        '$2',
      ) as SolidityCompilerLongVersion
    } catch (error: unknown) {
      const errMsg = 'Unable to determine solidity compiler version'
      this.logger?.error(errMsg)
      throw new Error(errMsg)
    }
  }
}
