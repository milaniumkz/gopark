# GoPark RBAC Matrix

## Roles

- `owner`
- `admin`
- `finance`
- `manager`
- `operator`
- `auditor`
- `driver`

## Access Rules

| Capability | owner | admin | finance | manager | operator | auditor | driver |
| --- | --- | --- | --- | --- | --- | --- | --- |
| View dashboard | yes | yes | yes | yes | yes | yes | no |
| Manage users and roles | yes | yes | no | no | no | no | no |
| View own driver profile | no | yes | yes | scoped | scoped | yes | yes |
| Create or edit drivers | yes | yes | no | scoped | yes | no | no |
| Create or edit cars | yes | yes | no | scoped | yes | no | no |
| Create contracts | yes | yes | yes | no | no | no | no |
| Approve payouts | yes | yes | yes | no | no | no | no |
| Request payout | no | no | no | no | no | no | yes |
| View ledger | yes | yes | yes | no | no | yes | no |
| Manual financial adjustment | yes | yes | yes | no | no | no | no |
| View audit log | yes | yes | yes | no | no | yes | no |
| Change driver operational statuses | yes | yes | no | scoped | yes | no | request only |

## Scope Rules

- `manager` is limited to assigned drivers, cars, incidents, and alerts in their group.
- `manager` quick actions are limited to actions scoped to that manager.
- `operator` can process operational data but cannot approve sensitive financial actions.
- `finance` has read and action rights over payments, payouts, obligations, and ledger.
- `driver` is restricted to self data only.
- In the current bootstrap header model, mobile scope is enforced against domain ids in `x-user-id`:
  - `driver` uses `drv_*`
  - `manager` uses `mgr_*`
