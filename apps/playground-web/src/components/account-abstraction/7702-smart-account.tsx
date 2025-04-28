"use client";

import { useState } from "react";
import { getContract, sendTransaction } from "thirdweb";
import { sepolia } from "thirdweb/chains";
import { claimTo } from "thirdweb/extensions/erc1155";
import { getNFT, getOwnedNFTs } from "thirdweb/extensions/erc1155";
import {
  ConnectButton,
  MediaRenderer,
  TransactionButton,
  useActiveAccount,
  useReadContract,
} from "thirdweb/react";
import { shortenHex } from "thirdweb/utils";
import { inAppWallet } from "thirdweb/wallets";
import { engineAccount } from "thirdweb/wallets/engine";
import { create7702MinimalAccount } from "thirdweb/wallets/smart";
import { THIRDWEB_CLIENT } from "../../lib/client";
import { Button } from "../ui/button";

const chain = sepolia;
const editionDropAddress = "0x7B3e0B8353Ad5cD6C60355B50550F63335752f9F";
const editionDropTokenId = 1n;

const editionDropContract = getContract({
  address: editionDropAddress,
  chain,
  client: THIRDWEB_CLIENT,
});

export function Eip7702SmartAccountPreview() {
  const [txHash, setTxHash] = useState<string | null>(null);
  const activeEOA = useActiveAccount();
  const { data: nft, isLoading: isNftLoading } = useReadContract(getNFT, {
    contract: editionDropContract,
    tokenId: editionDropTokenId,
  });
  const { data: ownedNfts } = useReadContract(getOwnedNFTs, {
    contract: editionDropContract,
    // biome-ignore lint/style/noNonNullAssertion: handled by queryOptions
    address: activeEOA?.address!,
    queryOptions: { enabled: !!activeEOA },
  });

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      {isNftLoading ? (
        <div className="mt-24 w-full">Loading...</div>
      ) : (
        <>
          <div className="flex flex-col justify-center gap-2 p-2">
            <ConnectButton
              client={THIRDWEB_CLIENT}
              chain={chain}
              wallets={[inAppWallet()]}
              connectButton={{
                label: "Login to mint!",
              }}
            />
          </div>
          {nft ? (
            <MediaRenderer
              client={THIRDWEB_CLIENT}
              src={nft.metadata.image}
              style={{ width: "300px", marginTop: "10px" }}
            />
          ) : null}
          {activeEOA ? (
            <div className="flex flex-col justify-center gap-4 p-2">
              <p className="mb-2 text-center font-semibold">
                You own {ownedNfts?.[0]?.quantityOwned.toString() || "0"}{" "}
                {nft?.metadata?.name}
              </p>
              <Button
                onClick={async () => {
                  const executor = engineAccount({
                    engineUrl:
                      "https://tw-unreal-demo.engine-usw2.thirdweb.com",
                    authToken:
                      "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiIweEEyMjRjRTVFMjM2ZDM5RkJkYzM3MzJGYzdGNzk4NWM5NDVhRTkxNmIiLCJzdWIiOiIweDRmQTkyMzBmNEU4OTc4NDYyY0U3QmY4ZTZiNWEyNTg4ZGE1RjQyNjQiLCJhdWQiOiJ0aGlyZHdlYi5jb20iLCJleHAiOjQ4OTk0MDg0NTUsIm5iZiI6MTc0NTgwODQ1NSwiaWF0IjoxNzQ1ODA4NDU1LCJqdGkiOiI2NTRlYjM0MC0yMTYxLTQ1ZTYtYWY2Mi0zYTA5N2QzOWJlZDUiLCJjdHgiOnsicGVybWlzc2lvbnMiOiJBRE1JTiJ9fQ.MHhkOTc5YWQzYWU0Yjg5NTRmZWZjZjMyOGYwYjRlNWJkOTdkZDAxZGUxMzkxOGFiNDcxNmViODUwNDAxMjIxMzNmNDQzODExMGZiMTQ0NGIwMjMyNjU5MmZiMTAzOTBjOGY5NWM3M2NlMWM4M2M4ODNmYmI2YzQ1ODg4MDBkZjNjZDFj",
                    walletAddress: "0x059be73eFc2A234BE5993802d13333266878f8E8",
                  });
                  const smartAccount = create7702MinimalAccount({
                    client: THIRDWEB_CLIENT,
                    adminAccount: activeEOA,
                    // executorAccount: executor,
                  });
                  const result = await sendTransaction({
                    transaction: claimTo({
                      contract: editionDropContract,
                      tokenId: editionDropTokenId,
                      to: activeEOA.address,
                      quantity: 1n,
                    }),
                    account: smartAccount,
                  });
                  setTxHash(result.transactionHash);
                }}
              >
                Mint Smart
              </Button>
              <TransactionButton
                transaction={() =>
                  claimTo({
                    contract: editionDropContract,
                    tokenId: editionDropTokenId,
                    to: activeEOA.address,
                    quantity: 1n,
                  })
                }
                payModal={{
                  metadata: nft?.metadata,
                }}
                onError={(error) => {
                  alert(`Error: ${error.message}`);
                }}
                onClick={() => {
                  setTxHash(null);
                }}
                onTransactionConfirmed={async (receipt) => {
                  setTxHash(receipt.transactionHash);
                }}
              >
                Mint EOA
              </TransactionButton>
            </div>
          ) : null}
          {txHash ? (
            <div className="flex flex-col justify-center p-2">
              <p className="mb-2 text-center text-green-500">
                Minted! Tx Hash:{" "}
                <a
                  href={`${chain.blockExplorers?.[0]?.url}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {shortenHex(txHash)}
                </a>
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
