# Finance Workflow

## Payment

1. create payment record
   - manual CRM/API payment is stored as `succeeded`, because the workflow immediately applies it to obligations, credit balance and ledger
2. validate payment input
   - amount must be positive
   - provider must not be empty
   - contract must exist and belong to the same driver
3. apply payment to open obligations of the selected contract, oldest due date first
4. store any remainder above current outstanding obligations as driver credit
5. create primary `payment` ledger entry for the full payment amount
6. if a remainder exists, create a separate `adjustment` ledger entry for credit creation
7. write audit events
8. emit outbox events for both payment registration and credit creation

## Overpayment

- payment is no longer rejected when it exceeds current outstanding obligations of the selected contract
- `appliedAmount` records the part allocated to obligations
- `unappliedAmount` records the remainder
- the remainder is stored as driver credit and reduces future effective debt / next payment on read-side
- credit creation is persisted as:
  - `driver_credit_balances`
  - `ledger.type = "adjustment"`
  - audit action `driver.credit.created`
  - outbox topic `driver.credit.created`

## Credit Writeoff

- `POST /api/payments/credit-writeoff` writes off part of an existing driver credit balance
- only `owner`, `admin`, `finance` may trigger it
- writeoff is rejected when:
  - amount is not positive
  - amount exceeds current `driver_credit_balances.amount`
- successful writeoff:
  - decreases `driver_credit_balances.amount`
  - writes `ledger.type = "refund"`
  - writes audit action `driver.credit.written_off`
  - emits outbox topic `driver.credit.written_off`

## Early Payoff

- `POST /api/payments/early-payoff` closes an active contract through a single payoff operation
- only `owner`, `admin`, `finance` may trigger it
- payoff is rejected when:
  - the contract does not exist
  - the contract does not belong to the specified driver
  - the contract is not `active`
  - the amount does not fully cover the current remaining debt of that contract
- successful payoff:
  - registers a normal payment for the requested amount
  - applies the payment only inside the selected contract
  - stores any excess above the remaining contract debt as driver credit
  - updates `contracts.status` to `closed`
  - writes audit action `contract.paid_off`
  - emits outbox topic `contract.paid_off`

## Payout

1. create payout request
2. create ledger entry
3. write audit event
4. create driver notification
5. after approval, create approval audit event, approval outbox event, and driver notification
6. reject the request when amount is not positive or exceeds the current available-to-withdraw balance

## Why extracted into a service

This logic belongs to a workflow layer, not to transport controllers and not to raw repositories.
It is the future place for:

- DB transactions
- antifraud checks
- approval steps
- provider-specific orchestration
- outbox event emission
