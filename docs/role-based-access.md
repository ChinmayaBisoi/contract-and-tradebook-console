# Role Based Access

Organisation access is controlled by the user's role on that organisation and
their membership status. Only `ACTIVE` memberships can use their role's
permissions; `DISABLED` and `REMOVED` memberships are rejected before the role
permission check runs.

| Access | Owner | Manager | Member |
|---|---:|---:|---:|
| Create organisations | ✓ | - | - |
| View organisations | ✓ | ✓ | ✓ |
| Update organisations | ✓ | - | - |
| Delete organisations | ✓ | - | - |
| Invite users to an organisation | ✓ | ✓ | - |
| Remove users from an organisation | ✓ | ✓ | - |
| Activate or disable organisation users | ✓ | ✓ | - |

Managers can invite, remove, activate, or disable member-level users. Owners can
manage all organisation records and memberships.
