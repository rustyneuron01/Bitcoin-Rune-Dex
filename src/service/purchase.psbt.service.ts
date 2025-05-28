import * as Bitcoin from "bitcoinjs-lib";
import { Runestone, RuneId } from "runestone-js";
import { U128, U32, U64 } from "big-varuint-js";
import { initEccLib, opcodes, script, networks, Psbt } from "bitcoinjs-lib";
import * as ecc from "tiny-secp256k1";
import { type IUtxo, type IRuneUtxo, type IArrayList } from "../types/types";
import { ORDINAL_RECEIVE_VALUE, testVersion } from "../config/config";
import { WalletTypes } from "../config/constant";
import { getFeeRate } from "./mempool";
import { getBtcUtxoByAddress } from "./psbt.utils";
import { calculateTxFee, getTxHexById } from "./psbt.service";

initEccLib(ecc);

const network = testVersion ? networks.testnet : networks.bitcoin;

export const createMultiUserRune = (
  runeTx: bigint,
  runeId: bigint,
  tokenSum: number,
  receiverList: IArrayList[]
) => {
  const edicts = [];
  let cnt = 1;
  let claimAmount = 0;
  for (const receiverAddress of receiverList) {
    edicts.push({
      id: new RuneId(new U64(runeTx), new U32(runeId)),
      amount: new U128(BigInt(receiverAddress.amount)),
      output: new U32(BigInt(cnt)),
    });
    claimAmount += receiverAddress.amount;
    cnt++;
  }
  if (tokenSum < claimAmount) throw "Invalid Claimable Amount";
  edicts.push({
    id: new RuneId(new U64(runeTx), new U32(runeId)),
    amount: new U128(BigInt(tokenSum - claimAmount)),
    output: new U32(BigInt(cnt)),
  });
  const runestone = new Runestone({
    edicts: edicts,
  });
  const buffer = runestone.enchiper();
  return {
    buffer,
    commitBuffer: runestone.etching?.rune?.commitBuffer(),
  };
};

export const createRune = (
  runeTx: bigint,
  runeId: bigint,
  tokenSum: number,
  sendAmount: number
) => {
  const edicts = [
    {
      id: new RuneId(new U64(runeTx), new U32(runeId)),
      amount: new U128(BigInt(sendAmount)),
      output: new U32(BigInt(1)),
    },
    {
      id: new RuneId(new U64(runeTx), new U32(runeId)),
      amount: new U128(BigInt(tokenSum - sendAmount)),
      output: new U32(BigInt(2)),
    },
  ];
  const runestone = new Runestone({
    edicts: edicts,
  });
  const buffer = runestone.enchiper();
  return {
    buffer,
    commitBuffer: runestone.etching?.rune?.commitBuffer(),
  };
};

export const calculateTxFeeViaCount = (
  psbt: Psbt,
  feeRate: number,
  userCounts: number
) => {
  const virtualSize =
    psbt.txInputs.length * 146 + (psbt.txOutputs.length + 1) * 33 + 10;
  return virtualSize * feeRate + (userCounts + 1) * ORDINAL_RECEIVE_VALUE;
};

export const generateRuneSendPsbt = async (
  runeBuffer: Buffer,
  btcUtxos: IUtxo[],
  runeUtxos: IRuneUtxo[],
  receiverAddress: string,
  usedTxId: string[],
  senderOrdinalPubkey: string,
  senderPaymentPubkey: string,
  senderPaymentAddress: string,
  senderOrdinalAddress: string
) => {
  let totalBtcAmount = 0;

  const psbt = new Psbt({ network });
  const feeRate = await getFeeRate();
  for (const runeUtxo of runeUtxos) {
    psbt.addInput({
      hash: runeUtxo.txid,
      index: runeUtxo.vout,
      witnessUtxo: {
        value: runeUtxo.value,
        script: Buffer.from(runeUtxo.scriptpubkey as string, "hex"),
      },
      tapInternalKey: Buffer.from(senderOrdinalPubkey, "hex").slice(1, 33),
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
  psbt.addOutput({
    address: receiverAddress,
    value: ORDINAL_RECEIVE_VALUE,
  });
  psbt.addOutput({
    address: senderOrdinalAddress,
    value: ORDINAL_RECEIVE_VALUE,
  });

  for (const btcUtxo of btcUtxos) {
    const fee = calculateTxFeeViaCount(psbt, feeRate, 2);
    if (
      totalBtcAmount < fee + ORDINAL_RECEIVE_VALUE * 2 &&
      btcUtxo.value > 10000 &&
      !usedTxId.includes(btcUtxo.txid + btcUtxo.vout)
    ) {
      totalBtcAmount += btcUtxo.value;
      psbt.addInput({
        hash: btcUtxo.txid,
        index: btcUtxo.vout,
        witnessUtxo: {
          value: btcUtxo.value,
          script: Buffer.from(btcUtxo.scriptpubkey as string, "hex"),
        },
        tapInternalKey: Buffer.from(senderPaymentPubkey, "hex").slice(1, 33),
      });
      usedTxId.push(btcUtxo.txid + btcUtxo.vout);
    }
  }

  const fee = calculateTxFeeViaCount(psbt, feeRate, 2);
  console.log("Pay Fee =>", fee, totalBtcAmount);

  if (totalBtcAmount < fee + ORDINAL_RECEIVE_VALUE * 2)
    throw "BTC Balance is not enough";

  psbt.addOutput({
    address: senderPaymentAddress,
    value: totalBtcAmount - fee - ORDINAL_RECEIVE_VALUE * 2,
  });

  return psbt;
};

export const generateBTCSendPsbt = async (
  walletType: string,
  recieverAddress: string,
  senderOrdinalPubkey: string,
  senderPaymentPubkey: string,
  senderOrdinalAddress: string,
  price: number,
  usedUTXOs: string[]
) => {
  // console.log(" <<<< Generate PSBT for sign >>>> ");
  const returnUtxos = usedUTXOs;

  const psbt = new Bitcoin.Psbt({ network: network });

  // Add Inscription Input
  let paymentAddress, paymentoutput;

  if (walletType === WalletTypes.XVERSE) {
    const hexedPaymentPubkey = Buffer.from(senderPaymentPubkey, "hex");
    const p2wpkh = Bitcoin.payments.p2wpkh({
      pubkey: hexedPaymentPubkey,
      network: network,
    });

    const { address, redeem } = Bitcoin.payments.p2sh({
      redeem: p2wpkh,
      network: network,
    });

    paymentAddress = address;
    paymentoutput = redeem?.output;
  } else if (
    walletType === WalletTypes.UNISAT ||
    walletType === WalletTypes.OKX
  ) {
    paymentAddress = senderOrdinalAddress;
  } else if (walletType === WalletTypes.HIRO) {
    const hexedPaymentPubkey = Buffer.from(senderPaymentPubkey, "hex");
    const { address, output } = Bitcoin.payments.p2wpkh({
      pubkey: hexedPaymentPubkey,
      network: network,
    });
    paymentAddress = address;
  }

  // console.log("add 1, 2 output!!");

  const btcUtxos = await getBtcUtxoByAddress(paymentAddress as string);
  const feeRate = await getFeeRate();

  // console.log("feeRate ==>", feeRate);

  let amount = 0;

  const buyerPaymentsignIndexes: number[] = [];

  // console.log("payer btcUtxos", btcUtxos);

  psbt.addOutput({
    address: recieverAddress as string,
    value: price,
  });

  for (const utxo of btcUtxos) {
    const fee = calculateTxFee(psbt, feeRate);
    if (
      amount < fee + price &&
      utxo.value > 2000 &&
      !returnUtxos.includes(utxo.txid + utxo.vout)
    ) {
      amount += utxo.value;

      buyerPaymentsignIndexes.push(psbt.inputCount);

      if (walletType === WalletTypes.UNISAT) {
        if (senderOrdinalAddress.length == 62) {
          psbt.addInput({
            hash: utxo.txid,
            index: utxo.vout,
            witnessUtxo: {
              value: utxo.value,
              script: Buffer.from(utxo.scriptpubkey as string, "hex"),
            },
            tapInternalKey: Buffer.from(senderOrdinalPubkey, "hex").slice(
              1,
              33
            ),
            sighashType: Bitcoin.Transaction.SIGHASH_ALL,
          });
        } else {
          psbt.addInput({
            hash: utxo.txid,
            index: utxo.vout,
            witnessUtxo: {
              value: utxo.value,
              script: Buffer.from(utxo.scriptpubkey as string, "hex"),
            },
          });
        }
      } else if (walletType === WalletTypes.OKX) {
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: {
            value: utxo.value,
            script: Buffer.from(utxo.scriptpubkey as string, "hex"),
          },
          tapInternalKey: Buffer.from(senderOrdinalPubkey, "hex"),
          sighashType: Bitcoin.Transaction.SIGHASH_ALL,
        });
      } else if (walletType === WalletTypes.HIRO) {
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: {
            value: utxo.value,
            script: Buffer.from(utxo.scriptpubkey as string, "hex"),
          },
        });
      } else if (walletType === WalletTypes.XVERSE) {
        const txHex = await getTxHexById(utxo.txid);

        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          redeemScript: paymentoutput,
          nonWitnessUtxo: Buffer.from(txHex, "hex"),
          sighashType: Bitcoin.Transaction.SIGHASH_ALL,
        });
      }

      returnUtxos.push(utxo.txid + utxo.vout);
    }
  }

  const fee = calculateTxFee(psbt, feeRate);

  if (amount < price + fee)
    throw "You do not have enough bitcoin in your wallet";

  psbt.addOutput({
    address: paymentAddress as string,
    value: amount - price - fee,
  });

  return psbt;
};
