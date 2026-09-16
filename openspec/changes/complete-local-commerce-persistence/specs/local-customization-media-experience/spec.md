## Purpose

Let customers in the explicit local_persistent development/test mode upload and reorder multiple private photos, crop them visually and restore their confirmed customization after refresh or application restart. Preserve accessible alternatives and truthful progress while preventing asynchronous upload races, client-only previews and unsupported image-analysis claims from becoming purchase authority.

All new durability, server-derived completion and same-operation recovery requirements in this capability apply to `local_persistent` only. Shared interaction components MUST preserve existing `disabled` and `local_fake` source behavior; `local_fake` remains process-memory, loses receipts on restart and MUST NOT claim durable restoration or silently activate persistent services.

## ADDED Requirements

### Requirement: Multi-image drop and accessible equivalent controls
An enabled image customization field SHALL accept multiple selected files through drag/drop and a file-selection button within its server-authoritative image-count limit. Customers MUST be able to reorder images through drag interaction and equivalent labeled move controls, including keyboard operation. Touch/pointer interaction MUST support ordering without requiring desktop drag events. Focus, current order, upload progress and validation errors MUST remain perceivable and usable through the alternative controls; drag/drop MUST NOT be the only way to complete customization.

#### Scenario: Drop and reorder several images
- **WHEN** a customer drops several supported images into a field with remaining capacity and drags them into a different order
- **THEN** the field shows each image in its intended slot and the resulting order is the order submitted for persistence and purchase

#### Scenario: Complete the same work without a mouse
- **WHEN** a keyboard or touch user selects images with the file button and reorders them with labeled controls
- **THEN** the same ordered customization can be completed with visible focus/order feedback and without desktop drag/drop

#### Scenario: Exceed the configured image count
- **WHEN** a multi-file selection or drop exceeds the field's configured remaining capacity
- **THEN** the field clearly identifies files not accepted for upload, preserves existing slots and never silently submits more images than the server permits

### Requirement: Stable slots survive asynchronous upload and reorder races
Each selected image SHALL retain a stable slot identity and a current upload/selection generation independent of its array position. Upload progress, crop state and results MUST apply only to the matching live slot and generation. Reordering MUST NOT assign one image's receipt or preview to another image. Removal, cancellation or replacement MUST invalidate superseded results; late responses MUST NOT recreate a deleted slot, overwrite its replacement or change other slots. Any accepted but no-longer-selected upload MUST remain unselected and follow safe authorized cleanup rather than entering the draft implicitly.

#### Scenario: Uploads complete out of order during sorting
- **WHEN** images A and B upload concurrently, the user reverses their positions and B completes before A
- **THEN** each result attaches only to its own slot and the confirmed order stays B then A with the correct corresponding crop and preview

#### Scenario: Cancel or delete while reordering
- **WHEN** a user reorders images and removes or cancels an uploading slot before its success response arrives
- **THEN** the late response cannot restore that slot, overwrite the image now at its former position or add an unwanted receipt to the saved draft

#### Scenario: Replace a file before an older response arrives
- **WHEN** a slot's file is replaced while a previous upload or preview request is still in flight
- **THEN** only the replacement generation can update that slot, and an older success or failure cannot overwrite its image, crop or status

### Requirement: Per-image failures and retries preserve other work
The image field SHALL show decoding, uploading, persistence pending, confirmed and failed states accurately for each affected image. A failed upload, cancelled request or network interruption MUST NOT discard other successful images, their order or crops. Retrying MUST target the failed current slot and MUST NOT duplicate a previously accepted receipt after response loss. Unconfirmed required media MUST block final customization completion and purchase handoff with actionable feedback rather than becoming a ready receipt.

#### Scenario: Retry one failed image
- **WHEN** one image fails during a multi-image upload while other images succeed and the user retries only the failed image
- **THEN** the other receipts, crop values and selected order remain unchanged, and the retry resolves only the failed slot

#### Scenario: Lose an upload success response
- **WHEN** the server saved an upload but its response was lost and the same upload operation is retried
- **THEN** the existing accepted result is reconciled into the current live slot without creating a duplicate selected image or discarding other work

#### Scenario: Service unavailable during final save
- **WHEN** database or private Storage is unavailable while an image or draft save is pending
- **THEN** the UI reports the unconfirmed save and offers recovery, does not show final completion and does not silently switch to fake or browser-only authority

### Requirement: Visual non-destructive crop with parameter fallback
Customers SHALL be able to move and resize a visible crop selection over the original using mouse or touch/pointer interaction and see a responsive local preview. Labeled keyboard-operable position and width/height parameters MUST provide equivalent fallback editing, validation and reset-to-original behavior. The visible crop and fallback values MUST describe the same bounded region of the trusted original. Local preview is provisional; only server-validated crop metadata and its server-generated durable preview MUST establish the final saved state. Cropping MUST never overwrite original bytes.

#### Scenario: Pointer crop and parameter values agree
- **WHEN** a mouse or touch user moves and resizes the crop overlay
- **THEN** its position and size parameters update consistently, the provisional preview reflects that region and the original remains unchanged

#### Scenario: Keyboard crop produces the same result
- **WHEN** a keyboard user enters valid position and dimensions or resets the crop
- **THEN** the visible selection and provisional preview match those values and can be saved under the same server checks as pointer editing

#### Scenario: Reject invalid crop without losing confirmed work
- **WHEN** a user or forged request supplies an empty, non-finite, negative or out-of-bounds crop
- **THEN** field-specific feedback prevents final acceptance and preserves the last confirmed original and crop rather than claiming a saved preview

### Requirement: Restore confirmed ordered customization from durable authority
In `local_persistent`, the system SHALL persist ordered image references, stable slot associations and crop parameters in the owner's local draft, and use that confirmed state when producing cart and order snapshots. A refresh or actual application-process restart in this mode MUST restore the latest server-confirmed order and crops under the original valid session or guest grant. Older save or preview responses MUST NOT overwrite a newer confirmed revision. Unuploaded local selections and unsaved edits MUST be identified as unconfirmed rather than promised as recoverable. Browser storage or object URLs MUST NOT substitute for durable server confirmation. `local_fake` SHALL continue to fail safely after process-local receipt loss and MUST NOT reconstruct those receipts from the browser or persistent store.

#### Scenario: Refresh and recover in a fresh process
- **WHEN** a customer in `local_persistent` saves reordered and cropped images, refreshes and then reconnects after the application is terminated and recreated
- **THEN** the authorized draft restores the same confirmed order, crops and corresponding private previews without a fixture reset or replacement upload

#### Scenario: A stale save response arrives last
- **WHEN** an older order/crop save or preview response arrives after a newer revision has been confirmed
- **THEN** it cannot revert the latest confirmed customization or display an older preview as the latest completed save

#### Scenario: Memory mode still loses unpersisted receipts
- **WHEN** the application using `local_fake` restarts after an image upload
- **THEN** receipt-dependent operations fail safely under the existing memory-loss contract and neither UI nor server claims restoration from a database

#### Scenario: Distinguish device preview from completed save
- **WHEN** an original can be previewed locally but has not received durable server confirmation, or unsaved edits are lost on refresh
- **THEN** the interface identifies the pending/unsaved state, restores only server-confirmed work and never claims that a local canvas or object URL is a completed upload

### Requirement: Server-validated safe image limits and honest quality feedback
All upload entry points SHALL validate actual file bytes, detected MIME, decodability, decoded dimensions, file size, per-field image count and total decoded pixel limits on the server against the applicable configuration. Browser checks MUST be advisory rather than authority. SVG, HTML, disguised non-images, corrupt images and images exceeding enforced limits MUST be rejected; declared MIME or client dimensions MUST NOT bypass inspection. Dimension/resolution feedback MUST NOT be described as detecting blur, faces, side profiles, occlusion or people count. Those image-content capabilities remain deferred, not removed from the wider MVP requirements.

#### Scenario: Accept a supported image under configured limits
- **WHEN** an owner uploads valid JPEG, PNG or WebP bytes that decode within the configured byte, dimension, image-count and pixel limits
- **THEN** the server can accept the image and reports only the inspection results actually established from its bytes and dimensions

#### Scenario: Reject disguised or excessive content
- **WHEN** a request presents HTML or SVG as JPEG, corrupt encoded data, forged dimensions, oversized bytes, excessive image count or excessive decoded pixels
- **THEN** the server refuses acceptance even if browser checks were bypassed, returns safe actionable feedback and preserves other confirmed images

#### Scenario: Avoid unsupported image-quality claims
- **WHEN** an image passes resolution checks but contains blur, an obscured face or an unexpected number of people
- **THEN** the interface does not claim those contents were recognized or passed; any guidance distinguishes resolution checks from deferred content review

### Requirement: Browser acceptance demonstrates interaction and recovery boundaries
Acceptance SHALL cover desktop drag/drop and sorting, keyboard/button alternatives, mobile touch/pointer crop and sorting, count limits, out-of-order upload completion, cancellation, replacement, per-slot retry and stale-save handling. Persistent recovery evidence MUST use the real isolated local stack and a newly started application process, with owner and cross-user/forged-cookie cases. Missing stack services MUST be reported as blocked, not disguised as passing browser-only persistence. Offline interaction tests MUST remain database-free and be reported separately from integration evidence.

#### Scenario: Verify interaction parity and authorization
- **WHEN** desktop, keyboard and mobile customers exercise the same multi-image flow and another account attempts to restore the saved draft
- **THEN** the authorized flows preserve the same confirmed order/crops while the other account receives no private draft or preview

#### Scenario: Keep unavailable-stack evidence separate
- **WHEN** browser-only controls can be exercised but the selected local database or private Storage cannot be reached
- **THEN** interaction evidence is reported separately and persistent save/restart acceptance is blocked rather than passed