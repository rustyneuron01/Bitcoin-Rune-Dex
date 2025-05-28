import * as Bitcoin from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import axios from "axios";
import { opcodes, script, Psbt } from "bitcoinjs-lib";
import { Rune, Runestone, none, some, Terms, Range, Etching } from "runelib";
import {
  testVersion,
  SIGNATURE_SIZE,
  MEMPOOL_URL,
  ORDINAL_RECEIVE_VALUE,
} from "../config/config";
import {
  finalizePsbtInput,
  pushRawTx,
  finalizeTapscriptPsbtInput,
} from "./psbt.utils";
import { WIFWallet } from "./WIFWallet";
import {
  type IArrayList,
  type IMempoolUTXO,
  type IRuneUtxo,
  type IUtxo,
} from "../types/types";
import { toXOnly } from "./utils.service";
import { LocalWallet, publicKeyToScriptPk } from "./localWallet";
import { calculateTxFeeViaCount } from "./purchase.psbt.service";

Bitcoin.initEccLib(ecc);
const network = testVersion
  ? Bitcoin.networks.testnet
  : Bitcoin.networks.bitcoin;

const key = process.env.ADMIN_PRIVATE_KEY;
if (typeof key !== "string" || key === "") {
  throw new Error(
    "Environment variable PRIVATE_KEY must be set and be a valid string."
  );
}

const localWallet = new LocalWallet(key as string, testVersion ? 1 : 0);
const walletOutput = publicKeyToScriptPk(
  localWallet.pubkey,
  2,
  testVersion ? 1 : 0
);

const wallet = new WIFWallet({
  networkType: testVersion ? "testnet" : "mainnet",
  privateKey: key,
});

// Calc Tx Fee
export const calculateTxFee = (psbt: Bitcoin.Psbt, feeRate: number) => {
  const tx = new Bitcoin.Transaction();

  for (let i = 0; i < psbt.txInputs.length; i++) {
    const txInput = psbt.txInputs[i];
    tx.addInput(txInput.hash, txInput.index, txInput.sequence);
    tx.setWitness(i, [Buffer.alloc(SIGNATURE_SIZE)]);
  }

  for (let txOutput of psbt.txOutputs) {
    tx.addOutput(txOutput.script, txOutput.value);
  }
  tx.addOutput(psbt.txOutputs[0].script, psbt.txOutputs[0].value);
  tx.addOutput(psbt.txOutputs[0].script, psbt.txOutputs[0].value);

  return Math.round(tx.virtualSize() * feeRate);
};

export const getTxHexById = async (txId: string) => {
  try {
    const { data } = await axios.get(`${MEMPOOL_URL}/tx/${txId}/hex`);

    return data as string;
  } catch (error) {
    console.log("Mempool api error. Can not get transaction hex");

    throw "Mempool api is not working now. Try again later";
  }
};

// Generate Inscribe Image PSBT
export const inscribeImagePSBT = async (
  utxo: IMempoolUTXO[],
  ordinal_p2tr: Bitcoin.payments.Payment,
  redeem: any,
  receiveAddress: string
) => {
  const psbt = new Bitcoin.Psbt({ network });
  psbt.addInput({
    hash: utxo[0].txid,
    index: utxo[0].vout,
    tapInternalKey: toXOnly(wallet.ecPair.publicKey),
    witnessUtxo: { value: utxo[0].value, script: ordinal_p2tr.output! },
    tapLeafScript: [
      {
        leafVersion: redeem.redeemVersion,
        script: redeem.output,
        controlBlock: ordinal_p2tr.witness![ordinal_p2tr.witness!.length - 1],
      },
    ],
  });
  psbt.addOutput({
    address: receiveAddress,
    value: ORDINAL_RECEIVE_VALUE,
  });

  return psbt;
};

// Genreate Rune PSBT
export const inscribeRunePSBT = async (
  utxo: IMempoolUTXO[],
  script_p2tr: Bitcoin.payments.Payment,
  etching_p2tr: Bitcoin.payments.Payment,
  redeem: any,
  receiveAddress: string,
  symbol: string,
  runeAmount: number,
  originalName: string,
  spacers: number
) => {
  const psbt = new Bitcoin.Psbt({ network });
  psbt.addInput({
    hash: utxo[0].txid,
    index: utxo[0].vout,
    witnessUtxo: { value: utxo[0].value, script: script_p2tr.output! },
    tapLeafScript: [
      {
        leafVersion: redeem.redeemVersion,
        script: redeem.output,
        controlBlock: etching_p2tr.witness![etching_p2tr.witness!.length - 1],
      },
    ],
  });

  const rune = Rune.fromName(originalName);

  const terms = new Terms(
    0,
    0,
    new Range(none(), none()),
    new Range(none(), none())
  );

  const etching = new Etching(
    none(),
    some(runeAmount),
    some(rune),
    some(spacers),
    some(symbol),
    some(terms),
    true
  );

  const stone = new Runestone([], some(etching), none(), none());

  psbt.addOutput({
    script: stone.encipher(),
    value: 0,
  });

  psbt.addOutput({
    address: receiveAddress,
    value: ORDINAL_RECEIVE_VALUE,
  });

  return psbt;
};

// Generate Send BTC to All Users
export const generateSendPendingUsersPSBT = async (
  txId: string,
  vout: number,
  value: number,
  receiveAddressList: IArrayList[]
) => {
  const psbt = new Bitcoin.Psbt({ network: network });

  psbt.addInput({
    hash: txId,
    index: vout,
    witnessUtxo: {
      value: value,
      script: wallet.output,
    },
    tapInternalKey: toXOnly(wallet.ecPair.publicKey),
  });

  for (const item of receiveAddressList) {
    psbt.addOutput({ address: item.address as string, value: item.amount });
  }

  return psbt;
};

// Generate Send Rune To All Users
export const generateSendRuneUsersPSBT = async (
  runeBuffer: Buffer,
  btcUtxo: IUtxo,
  runeUtxos: IRuneUtxo[],
  receiverList: IArrayList[]
) => {
  const psbt = new Psbt({ network });

  for (const runeUtxo of runeUtxos) {
    psbt.addInput({
      hash: runeUtxo.txid,
      index: runeUtxo.vout,
      witnessUtxo: {
        value: runeUtxo.value,
        script: Buffer.from(walletOutput as string, "hex"),
      },
      tapInternalKey: Buffer.from(localWallet.pubkey, "hex").slice(1, 33),
    });
  }

  const runeScript = script.compile([
    opcodes.OP_RETURN,
    opcodes.OP_13,
    runeBuffer,
  ]);
  psbt.addOutput({
    script: runeScript,
    value: 0,
  });
  for (const receiverAddress of receiverList) {
    psbt.addOutput({
      address: receiverAddress.address as string,
      value: ORDINAL_RECEIVE_VALUE,
    });
  }
  psbt.addOutput({
    address: localWallet.address,
    value: ORDINAL_RECEIVE_VALUE,
  });

  psbt.addInput({
    hash: btcUtxo.txid,
    index: btcUtxo.vout,
    witnessUtxo: {
      value: btcUtxo.value,
      script: wallet.output,
    },
    tapInternalKey: Buffer.from(localWallet.pubkey, "hex").slice(1, 33),
  });

  return psbt;
};

export const transferRuneToken = async (
  runeBuffer: Buffer,
  receiverList: IArrayList[],
  btcUtxo: IUtxo,
  runeUtxos: IRuneUtxo[]
) => {
  try {
    const psbt: Psbt = await generateSendRuneUsersPSBT(
      runeBuffer,
      btcUtxo,
      runeUtxos,
      receiverList
    );

    return psbt;
    // return "abfb2f3d3a2fd8265952cebafa5dded651c8dd5767ee215ba3935c581b89b572";
  } catch (error) {
    console.log(error);
    throw error;
  }
};

// Generate BTC Transfer PSBT
export const generateSendBTCPSBT = async (
  feeRate: number,
  btcUtxos: IUtxo[],
  btcOutputs: IArrayList[],
  totalBTCAmount: number
) => {
  let amount = 0;
  const psbt = new Bitcoin.Psbt({ network: network });

  for (const eachItem of btcOutputs) {
    psbt.addOutput({
      address: eachItem.address as string,
      value: eachItem.amount,
    });
  }

  for (const utxo of btcUtxos) {
    console.log("we are here");
    const fee = calculateTxFee(psbt, feeRate);
    console.log("we are here1");
    if (amount < fee + totalBTCAmount && utxo.value > 10000) {
      amount += utxo.value;

      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          value: utxo.value,
          script: wallet.output,
        },
        tapInternalKey: toXOnly(wallet.ecPair.publicKey),
      });
    }
  }

  const fee = calculateTxFee(psbt, feeRate);

  // console.log("fee ==>", fee);

  if (amount < fee + totalBTCAmount)
    throw "You do not have enough bitcoin in your wallet";

  psbt.addOutput({
    address: wallet.address,
    value: amount - totalBTCAmount - fee,
  });

  return psbt;
};

// Broadcast PSBT
export const broadcastPSBT = async (psbt: string) => {
  try {
    const tx = await finalizePsbtInput(psbt);
    const txId = await pushRawTx(tx.toHex());

    console.log("Boradcast PSBT txid => ", txId);
    return txId;
  } catch (error) {
    console.log("Boradcast PSBT Error => ", error);
    throw error;
  }
};

// Broadcast PSBT
export const broadcastTapscriptPSBT = async (psbt: string) => {
  try {
    const tx = await finalizeTapscriptPsbtInput(psbt);
    const txId = await pushRawTx(tx.toHex());

    console.log("Boradcast PSBT txid => ", txId);
    return txId;
  } catch (error) {
    console.log("Boradcast PSBT Error => ", error);
    throw error;
  }
};
