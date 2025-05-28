import * as Bitcoin from "bitcoinjs-lib";
import { testVersion } from "../config/config";
import MultisigModel from "../model/multiSigWalletModel";
import { calculateTxFee, getTxHexById } from "../service/psbt.service";
import {
  combinePsbt,
  getBtcUtxoByAddress,
  specialfinalizePsbtInput,
} from "../service/psbt.utils";
import RequestModal from "../model/requestModel";
import userModel from "../model/userModel";
import { wallet } from "./etchingController";
import { getFeeRate } from "../service/mempool";

const bitcoin = require("bitcoinjs-lib");

const network = testVersion
  ? bitcoin.networks.testnet
  : bitcoin.networks.bitcoin;

export async function createNativeSegwit(
  userId: string,
  originPubkeys: string[],
  threshold: number,
  network: any
) {
  try {
    const existMusigWallet = await MultisigModel.findOne({
      userId,
    });

    if (existMusigWallet)
      return {
        success: true,
        message: "These public key pair is already existed.",
        wallet: existMusigWallet,
      };

    const hexedPubkeys = originPubkeys.map((pubkey) =>
      Buffer.from(pubkey, "hex")
    );
    const p2ms = bitcoin.payments.p2ms({
      m: parseInt(threshold.toString()),
      pubkeys: hexedPubkeys,
      network,
    });
    const p2wsh = bitcoin.payments.p2wsh({ redeem: p2ms, network });

    const newMultisigWallet = new MultisigModel({
      userId,
      cosigner: originPubkeys,
      witnessScript: p2wsh.redeem.output.toString("hex"),
      p2msOutput: "0020" + bitcoin.crypto.sha256(p2ms.output).toString("hex"),
      address: p2wsh.address,
      threshold,
    });

    await newMultisigWallet.save();
    console.log(
      "created newMultisigWallet ==> ",
      newMultisigWallet._id.toString()
    );

    return {
      success: true,
      message: "Create Musig Wallet successfully.",
      wallet: newMultisigWallet,
    };
  } catch (error: any) {
    console.log("error in creating segwit address ==> ", error);
    return {
      success: false,
      message: "There is something error",
      payload: null,
    };
  }
}

export const getOrCreateMultiSigWallet = async (userId: string) => {
  const userDocument = await userModel.findOne({ userId });
  if (!userDocument) {
    return {
      success: false,
    };
  }

  let pubkeys: string[] = [];
  pubkeys.push(userDocument?.ordinalPublicKey);
  pubkeys.push(wallet?.pubkey);

  const minSignCount: number = 2;

  const payload: any = await createNativeSegwit(
    userDocument.userId,
    pubkeys,
    minSignCount,
    testVersion ? Bitcoin.networks.testnet : Bitcoin.networks.bitcoin
  );
  return payload;
};

export async function makeRequest(
  userId: string,
  transferAmount: number,
  destinationAddress: string,
  ordinalAddress: string,
  pubKey: string
) {
  const MusigWallet = await getOrCreateMultiSigWallet(userId);
  console.log("MusigWallet :>> ", MusigWallet);
  if (!MusigWallet.success)
    return {
      success: false,
      message: "Not Found Multisig wallet.",
    };

  const { witnessScript, p2msOutput, address, threshold, cosigner } =
    MusigWallet.wallet;
  console.log(
    "{ witnessScript, p2msOutput, address, threshold, cosigner } :>> ",
    { witnessScript, p2msOutput, address, threshold, cosigner }
  );

  const pubkeyAllowed = cosigner.findIndex((key: string) => key == pubKey);
  if (pubkeyAllowed < 0)
    return {
      success: false,
      message: "Not allowed pubkey.",
    };

  const psbt = new bitcoin.Psbt({ network });
  const usedUtxoIds = [];
  let total = 0;
  const utxos = await getBtcUtxoByAddress(address);
  if (utxos.length == 0) {
    return "There is no UTXO in this address";
  }

  transferAmount = Math.round(transferAmount);

  for (const utxo of utxos) {
    if (total < transferAmount + 25000 && utxo.value > 1000) {
      usedUtxoIds.push(utxo.txid);
      total += utxo.value;
      const utxoHex = await getTxHexById(utxo.txid);
      console.log("selected utxoHex ==> ", utxoHex);
      console.log("addInput ==> ", {
        hash: utxo.txid,
        index: utxo.vout,
        witnessScript: Buffer.from(witnessScript, "hex"),
        witnessUtxo: {
          script: Buffer.from(p2msOutput, "hex"),
          value: utxo.value,
        },
      });
      await psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessScript: Buffer.from(witnessScript, "hex"),
        witnessUtxo: {
          script: Buffer.from(p2msOutput, "hex"),
          value: utxo.value,
        },
      });
    }
  }

  psbt.addOutput({
    address: destinationAddress,
    value: transferAmount,
  });
  const feeRate = await getFeeRate();
  // const feeRate = 300;
  const fee = calculateTxFee(psbt, feeRate);

  console.log("feeRate ==> ", feeRate);
  console.log("fee ==> ", fee);
  psbt.addOutput({
    address: address,
    value: total - fee - transferAmount,
  });

  const newRequest = await RequestModal.findOneAndUpdate(
    { userId, psbt: [psbt.toHex()] }, // filter to find the document
    {
      $set: {
        userId,
        type: "Tranfer",
        transferAmount,
        destinationAddress,
        creator: ordinalAddress,
        cosigner,
        signedCosigner: [],
        psbt: [psbt.toHex()],
        threshold,
      },
    }, // update operation
    { upsert: true, new: true } // options: upsert = true will create a new document if none is found, new = true will return the updated document
  );

  // const newRequest = new RequestModal({
  //   userId,
  //   type: "Tranfer",
  //   transferAmount,
  //   destinationAddress,
  //   creator: ordinalAddress,
  //   cosigner,
  //   signedCosigner: [],
  //   psbt: [psbt.toHex()],
  //   threshold,
  // });

  // await newRequest.save();

  console.log("psbt.toHex() ==> ", psbt.toHex());

  return {
    requestId: newRequest.requestId,
    psbt: psbt.toHex(),
  };
}

export const execRequest = async (requestId: string) => {
  const requestData: any = await RequestModal.findOne({ requestId });
  if (!requestData)
    return {
      success: false,
      message: "There is no request with this id",
      payload: null,
    };
  const signedPSBT = requestData.psbt[2];
  console.log("signedPSBT :>> ", signedPSBT);
  const tempPsbt = bitcoin.Psbt.fromHex(signedPSBT);
  const inputCount = tempPsbt.inputCount;
  const inputArr = Array.from({ length: inputCount }, (_, index) => index);
  console.log("inputArr in exec ==> ", inputArr);

  let sellerSignPSBT = specialfinalizePsbtInput(signedPSBT, inputArr);
  const tempPsbt2 = bitcoin.Psbt.fromHex(sellerSignPSBT);
  console.log(
    "virtual size in exec ==> ",
    tempPsbt2.extractTransaction(true).virtualSize()
  );
  console.log("feeRate ==> ", (await getFeeRate()) + 1);

  console.log("sellerSignPSBT ==> ", sellerSignPSBT);

  const txID = await combinePsbt(requestData.psbt[1], sellerSignPSBT);
  return txID;
};
