import type { Definition, TypedData } from "ox/TypedData";
import type { Hex, SignableMessage } from "viem";
import { getCachedChain } from "../../../../chains/utils.js";
import type { ThirdwebClient } from "../../../../client/client.js";
import { getBytecode } from "../../../../contract/actions/get-bytecode.js";
import {
  type ThirdwebContract,
  getContract,
} from "../../../../contract/contract.js";
import { execute } from "../../../../extensions/erc7702/__generated__/MinimalAccount/write/execute.js";
import { executeWithSig } from "../../../../extensions/erc7702/__generated__/MinimalAccount/write/executeWithSig.js";
import type { SignedAuthorization } from "../../../../transaction/actions/eip7702/authorization.js";
import { encode } from "../../../../transaction/actions/encode.js";
import { toSerializableTransaction } from "../../../../transaction/actions/to-serializable-transaction.js";
import type { SendTransactionResult } from "../../../../transaction/types.js";
import { getAddress } from "../../../../utils/address.js";
import { resolvePromisedValue } from "../../../../utils/promise/resolve-promised-value.js";
import { randomBytesHex } from "../../../../utils/random.js";
import type {
  Account,
  SendTransactionOption,
} from "../../../interfaces/wallet.js";

const MINIMAL_ACCOUNT_IMPLEMENTATION_ADDRESS =
  "0xad7986EBD5C74C3d5C03e727261Aa9a9d65B0291";

export const create7702MinimalAccount = (args: {
  client: ThirdwebClient;
  adminAccount: Account;
  executorAccount?: Account;
}): Account => {
  const { client, adminAccount, executorAccount } = args;
  console.log("-- DEBUG --", adminAccount, executorAccount);

  const _sendTxWithAuthorization = async (txs: SendTransactionOption[]) => {
    const firstTx = txs[0];
    if (!firstTx) {
      throw new Error("No transactions provided");
    }
    const chain = getCachedChain(firstTx.chainId);
    const eoaContract = getContract({
      address: adminAccount.address,
      client,
      chain,
    });
    // check if account has been delegated already
    let authorizationList: SignedAuthorization[] | undefined = undefined;
    const isMinimalAccount = await is7702MinimalAccount(eoaContract);
    if (!isMinimalAccount) {
      console.log("Signing authorization");
      // if not, sign authorization
      const authorization = await adminAccount.signAuthorization?.({
        address: MINIMAL_ACCOUNT_IMPLEMENTATION_ADDRESS,
        chainId: firstTx.chainId,
        nonce: BigInt(firstTx.nonce ?? 0), // TODO (7702): get remote nonce if not provided
      });
      console.log("Authorization signed", authorization);
      if (!authorization) {
        throw new Error("Failed to sign authorization");
      }
      authorizationList = [authorization];
    }
    if (executorAccount) {
      // send transaction from executor, needs signature
      const wrappedCalls = {
        calls: txs.map((tx) => ({
          target: getAddress(tx.to ?? ""), // will throw if undefined address
          value: tx.value ?? 0n,
          data: tx.data ?? "0x",
        })),
        uid: randomBytesHex(),
      };
      console.log("Signing wrapped calls", wrappedCalls);
      const signature = await adminAccount.signTypedData({
        domain: {
          name: "MinimalAccount",
          version: "1",
          chainId: firstTx.chainId,
          verifyingContract: eoaContract.address,
        },
        types: {
          WrappedCalls: [
            { name: "calls", type: "Call[]" },
            { name: "uid", type: "bytes32" },
          ],
          Call: [
            { name: "target", type: "address" },
            { name: "value", type: "uint256" },
            { name: "data", type: "bytes" },
          ],
        },
        message: wrappedCalls,
        primaryType: "WrappedCalls",
      });
      // wrap txs in a single execute call to the MinimalAccount
      const executeTx = executeWithSig({
        contract: eoaContract,
        wrappedCalls,
        signature,
        overrides: {
          value: wrappedCalls.calls.reduce((acc, call) => acc + call.value, 0n),
          authorizationList,
        },
      });
      // we don't estimate gas here on purpose, letting the executor handle it
      console.log("Serialized transaction with sig");
      return executorAccount.sendTransaction({
        to: eoaContract.address,
        data: await encode(executeTx),
        value: await resolvePromisedValue(executeTx.value),
        authorizationList,
        chainId: executeTx.chain.id,
        gas: 500_000n, // FIXME: estimate gas properly in engine
      });
    }
    // send transaction from EOA
    // wrap txs in a single execute call to the MinimalAccount
    const executeTx = execute({
      contract: eoaContract,
      calls: txs.map((tx) => ({
        target: tx.to ?? "",
        value: tx.value ?? 0n,
        data: tx.data ?? "0x",
      })),
      overrides: {
        gas: txs.reduce(
          (acc, tx) => acc + (tx.gas ? tx.gas + 100_000n : 500_000n),
          0n,
        ), // FIXME: estimate gas properly, RPC returns way too low values when EOA not delegated
        value: txs.reduce((acc, tx) => acc + (tx.value ?? 0n), 0n),
        authorizationList,
      },
    });
    // re-estimate gas for the entire batch + authorization
    const serializedTx = await toSerializableTransaction({
      transaction: executeTx,
      from: adminAccount.address,
    });
    console.log("Executing transaction", serializedTx);
    return adminAccount.sendTransaction(serializedTx);
  };

  const minimalAccount: Account = {
    address: adminAccount.address,
    sendTransaction: async (
      tx: SendTransactionOption,
    ): Promise<SendTransactionResult> => {
      return _sendTxWithAuthorization([tx]);
    },
    sendBatchTransaction: async (
      txs: SendTransactionOption[],
    ): Promise<SendTransactionResult> => {
      return _sendTxWithAuthorization(txs);
    },
    signMessage: ({
      message,
      originalMessage,
      chainId,
    }: {
      message: SignableMessage;
      originalMessage?: string;
      chainId?: number;
    }): Promise<Hex> =>
      adminAccount.signMessage({ message, originalMessage, chainId }),
    signTypedData: <
      const typedData extends TypedData | Record<string, unknown>,
      primaryType extends keyof typedData | "EIP712Domain" = keyof typedData,
    >(
      _typedData: Definition<typedData, primaryType>,
    ): Promise<Hex> => adminAccount.signTypedData(_typedData),
  };
  return minimalAccount;
};

export async function is7702MinimalAccount(
  eoaContract: ThirdwebContract,
): Promise<boolean> {
  const code = await getBytecode(eoaContract);
  const isDelegated = code.length > 0 && code.startsWith("0xef0100");
  const target = `0x${code.slice(6, 46)}`;
  console.log("-- DEBUG --", isDelegated, target, code);
  return isDelegated && target === MINIMAL_ACCOUNT_IMPLEMENTATION_ADDRESS;
}
