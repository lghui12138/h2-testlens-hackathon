# Trusted approval ledger boundary

This repository deliberately contains an empty `config/trusted-approval-ledger.v1.json`.
It does not invent an enterprise approval record and does not treat profile-supplied
`approverId`, `approvalRef`, or revision text as proof of approval.

## Runtime rule

An imported profile with `approvalStatus: approved` must match a trusted ledger row by:

- `profileId`, `revision`, and `methodId`;
- `status: approved`, non-expired `validUntil`, and `revoked: false`;
- a 64-character SHA-256 package binding;
- a package hash supplied by the controlled runtime, not by the profile JSON.

Missing, expired, revoked, duplicated, mismatched, or unsigned approval evidence fails
closed before analysis. `example_unapproved`, `pending`, and the three T02
`descriptive_only` profiles remain usable and keep their non-certification boundary.

## Enterprise evidence required before adding a row

The enterprise owner must provide a controlled approval artifact or approval-system
export with an externally verifiable issuer, approval record ID, subject, method and
revision, validity period, profile-package SHA-256, standard-reference digest, and
signature/authorization verification result. Private approver identities and ticket
contents must stay in the controlled system; only the minimum redacted binding belongs
in `public/config`.

This ledger can prove that a configured runtime is bound to a supplied approval record.
It does not replace enterprise signatures, calibration certificates, uncertainty
budgets, ISO/IEC 17025 competence evidence, safety validation, or formal GB/T/ISO
certification.
