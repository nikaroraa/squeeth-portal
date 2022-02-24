import { Box, TextField, Typography } from '@mui/material'
import { BigNumber } from 'ethers'
import * as React from 'react'
import { useBalance, useSigner } from 'wagmi'
import shallow from 'zustand/shallow'
import { PrimaryLoadingButton } from '../../components/button/PrimaryButton'
import { CRAB_STRATEGY, OSQUEETH } from '../../constants/address'
import { BIG_ZERO, MAX_UINT } from '../../constants/numbers'
import useCrab from '../../hooks/useCrab'
import useERC20 from '../../hooks/useERC20'
import useAccountStore from '../../store/accountStore'
import useCrabStore from '../../store/crabStore'
import useHedgeStore from '../../store/hedgeStore'
import { formatBigNumber, formatUnits, parseUnits, wmul } from '../../utils/math'

const TimeHedge = React.memo(function TimeHedge() {
  const owner = useAccountStore(s => s.address)
  const { isSelling, oSqthAmount } = useCrabStore(s => s.auctionDetails, shallow)
  const { erc20: squeethContract, erc20Loading } = useERC20(OSQUEETH)
  const { isApprovalNeeded, setIsApprovalNeeded, isApproved, setIsApproved, setTxLoading, txLoading } = useHedgeStore()
  const [{ data: oSqthBalData, loading: balanceLoading }] = useBalance({ addressOrName: owner, token: OSQUEETH })

  const checkApproval = React.useCallback(async () => {
    if (!owner || oSqthAmount.isZero()) return

    const allowance = await squeethContract.allowance(owner, CRAB_STRATEGY)
    console.log(allowance.toString(), oSqthAmount.toString(), allowance.gte(oSqthAmount))
    if (allowance.gte(oSqthAmount)) {
      setIsApproved(true)
    } else {
      setIsApproved(false)
    }
  }, [oSqthAmount, owner, setIsApproved, squeethContract])

  // Check if oSQTH approval is needed or not. Need only if strategy is buying oSQTH
  React.useEffect(() => {
    if (!owner) return
    if (isSelling) {
      setIsApprovalNeeded(false)
      return
    }

    setIsApprovalNeeded(true)
    checkApproval()
  }, [owner, isSelling, setIsApprovalNeeded, checkApproval])

  const approveOSQTH = React.useCallback(async () => {
    if (!owner) return

    setTxLoading(true)
    try {
      const tx = await squeethContract.approve(CRAB_STRATEGY, MAX_UINT)
      await tx.wait()
      checkApproval()
      console.log(tx)
    } catch (e) {
      console.log(e)
    }
    setTxLoading(false)
  }, [checkApproval, owner, setTxLoading, squeethContract])

  console.log('Is selling', isSelling)
  const { isError, errorMessage } = React.useMemo(() => {
    if (balanceLoading) return { isError: false, errorMessage: '' }

    if (!isSelling && !oSqthBalData?.value.gte(oSqthAmount))
      return {
        isError: true,
        errorMessage: `You need ${formatBigNumber(
          oSqthAmount,
          18,
          6,
        )} oSQTH to participate.\n Your balance: ${formatBigNumber(oSqthBalData?.value || BIG_ZERO, 18, 6)}`,
      }

    return { isError: false, errorMessage: '' }
  }, [balanceLoading, oSqthAmount, oSqthBalData?.value, isSelling])

  if (erc20Loading || balanceLoading) {
    return (
      <Box>
        <Typography align="center" color="textSecondary">
          Loading...
        </Typography>
      </Box>
    )
  }

  return (
    <Box>
      <Typography align="center" variant="h6">
        {isSelling ? 'Buy oSQTH from strategy' : 'Sell oSQTH to strategy'}
      </Typography>
      <Box mt={2} px={4} display="flex" justifyContent="center" flexDirection="column" width="100%">
        {isApprovalNeeded && !isApproved ? (
          <>
            <Typography align="center" mt={4} color="textSecondary">
              You need to approve oSQTH
            </Typography>
            <PrimaryLoadingButton loading={txLoading} sx={{ margin: 'auto', mt: 2, width: 250 }} onClick={approveOSQTH}>
              Approve
            </PrimaryLoadingButton>
          </>
        ) : isError ? (
          <Typography align="center" sx={{ color: 'error.main' }}>
            {errorMessage}
          </Typography>
        ) : (
          <TimeHedgeForm />
        )}
      </Box>
    </Box>
  )
})

const TimeHedgeForm = React.memo(function TimeHedgeForm() {
  const { crabContract, updateCrabData } = useCrab()
  const { isSelling, auctionPrice } = useCrabStore(s => s.auctionDetails, shallow)
  const auctionTriggerTime = useCrabStore(s => s.auctionTriggerTime)
  const [txLoading, setTxLoading] = useHedgeStore(s => [s.txLoading, s.setTxLoading])

  const safeAuctionPrice = auctionPrice.add(
    auctionPrice
      .mul(2)
      .div(100)
      .mul(isSelling ? 1 : -1),
  )
  const [limitPrice, setLimitPrice] = React.useState(formatUnits(safeAuctionPrice))

  const hedge = React.useCallback(async () => {
    const [isSelling, oSqthAmount, ethProceeds] = await crabContract.getAuctionDetails(auctionTriggerTime)
    const _safeAuctionPrice = safeAuctionPrice.add(
      safeAuctionPrice
        .mul(10)
        .div(100)
        .mul(isSelling ? 1 : -1),
    )
    setLimitPrice(formatUnits(_safeAuctionPrice))
    const ethToAttach = isSelling ? wmul(oSqthAmount, _safeAuctionPrice) : BIG_ZERO

    console.log(ethToAttach.toString(), ethProceeds.toString())
    setTxLoading(true)
    try {
      const tx = await crabContract.timeHedge(isSelling, parseUnits(limitPrice), { value: ethToAttach })
      await tx.wait()
    } catch (e) {
      console.log(e)
    }
    setTxLoading(false)
    updateCrabData()
  }, [crabContract, auctionTriggerTime, limitPrice, setTxLoading, updateCrabData])

  return (
    <>
      <TextField
        variant="outlined"
        sx={{ margin: 'auto', width: 250, mt: 2 }}
        value={limitPrice}
        onChange={v => setLimitPrice(v.target.value)}
        placeholder="Safe Limit Price"
        label="Safe Limit Price"
      />
      <PrimaryLoadingButton loading={txLoading} sx={{ margin: 'auto', mt: 2, width: 250 }} onClick={hedge}>
        Hedge
      </PrimaryLoadingButton>
    </>
  )
})

export default TimeHedge
