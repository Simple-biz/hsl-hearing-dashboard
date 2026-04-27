[33mcommit 84a008ee49e5812085862eeac92d4b7ac419ac63[m[33m ([m[1;36mHEAD[m[33m -> [m[1;32mfeature/mr-pivot-to-google-sheet-sync[m[33m, [m[1;31morigin/feature/mr-pivot-to-google-sheet-sync[m[33m)[m
Author: jvincec <jvincec@simple.biz>
Date:   Fri Apr 24 21:56:55 2026 +0800

    Add claimant identity key to optimized MR sync payload
    
    Restore the optimized MR field update handling while preserving SSN last 4 in sync events and adding claimant_key for duplicate-prevention matching in n8n.

[33mcommit 63006c4dbd73b4682c0b8982aaf0509f5193779b[m
Author: jvincec <jvincec@simple.biz>
Date:   Fri Apr 24 21:16:50 2026 +0800

    Unify MR sync history modal fixes
    
    Merge System Admin masking, SSN last 4 display, backup banner cleanup, and checkbox diff formatting into a single consistent change-history modal implementation.

[33mcommit 03f5e6d6536071ad8dea6badc9cdb68c87d812f2[m
Author: jvincec <jvincec@simple.biz>
Date:   Fri Apr 24 04:44:35 2026 +0800

    Show checkbox states clearly in MR sync history
    
    Format checkbox field diffs in the MR sync change history modal so boolean changes render as checked/unchecked instead of blank or placeholder values.

[33mcommit cbdeb04124ac1fed772f42eb59b5df852babca49[m
Author: jvincec <jvincec@simple.biz>
Date:   Fri Apr 24 04:36:25 2026 +0800

    Show SSN last 4 in MR sync history modal
    
    Add ssn_last_4 to the MR sync event payload, carry it through the n8n sync-history response, and display it in the change history modal for claimant context.

[33mcommit 64099cd93f56d13b21fc181a9bc434212c6feede[m
Author: jvincec <jvincec@simple.biz>
Date:   Fri Apr 24 04:04:41 2026 +0800

    Hide system admin identity in MR sync history modal
    
    Update the MR Google Sheets change history modal so System Admin runs display neutral wording like 'Ran on ...' and remove admin-identifying traces from the backup banner display.

[33mcommit 103dde206387f98a6c1d14a43ac68d6cbb2dae49[m
Author: jvincec <jvincec@simple.biz>
Date:   Fri Apr 24 03:26:28 2026 +0800

    Optimize MR Pivot inline field updates
    
    Refactor MR Pivot server actions to reduce extra DB round trips during inline edits and add optimistic UI updates with rollback on failure. Improves checkbox and dropdown responsiveness while preserving sync-event logging for Google Sheets history.

[33mcommit 2e64ef0afd26dcdcf95c2dce2aaef7a6764ad6d1[m
Author: jvincec <jvincec@simple.biz>
Date:   Fri Apr 24 02:40:49 2026 +0800

    fix(sync): source sheet url from persisted workflow metadata

[33mcommit 35129206590247b516b20ad0106934b4e0b5dc77[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Apr 21 04:20:00 2026 +0800

    replace url sheet backup for testing

[33mcommit 1a030947344fce54edf149c9e21c732bcc47972a[m
Merge: c967082 dd6b991
Author: jvincec <jvincec@simple.biz>
Date:   Tue Apr 21 01:55:19 2026 +0800

    fix(branch): Resolve merge conflicts

[33mcommit dd6b991c76567f9b9e3a8bfcf1e9ed730eb13747[m[33m ([m[1;31morigin/develop[m[33m)[m
Merge: dd759bb 8867521
Author: jerup-dev <jerup@simple.biz>
Date:   Mon Apr 20 11:43:50 2026 -0400

    Merge pull request #156 from Simple-biz/feature/post-hrg-review2
    
    add chronicle and link editor in rep docs

[33mcommit 88675214c568ba42f8185a2e549d9bed31a170cb[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Mon Apr 20 11:42:12 2026 -0400

    add chronicle and link editor in rep docs

[33mcommit dd759bbc5bf8f9db0b6c80bc20e7c14d423c8904[m
Merge: c2189b0 4cbc379
Author: jerup-dev <jerup@simple.biz>
Date:   Mon Apr 20 11:22:43 2026 -0400

    Merge pull request #154 from Simple-biz/feature/post-hrg-review2
    
    added link_editor

[33mcommit 4cbc37960298d6b6c527f3e4f602a2815d518d9d[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Mon Apr 20 11:20:53 2026 -0400

    added link_editor

[33mcommit c2189b081a3f05c4862c14bbee340fdb1d03285e[m
Merge: 07b89dd 6fd1c33
Author: jerup-dev <jerup@simple.biz>
Date:   Mon Apr 20 09:53:21 2026 -0400

    Merge pull request #152 from Simple-biz/feature/post-hrg-review2
    
    Feature/post hrg review2

[33mcommit 6fd1c331e962e16474eb32852186f171bdd6fd70[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Mon Apr 20 09:48:17 2026 -0400

    fixed activity log and change modal view

[33mcommit 687f94f111274a0e0bd3c51471333384aaeae355[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Apr 17 17:47:47 2026 -0400

    added additional ui changes and filters

[33mcommit 499c206f0908a62802a2661fa80b8aefb37d8303[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Apr 17 15:35:13 2026 -0400

    added hearing indicators and moved other columns

[33mcommit c967082f99cad55ee4a55ffd5cd7a63ab45fd545[m
Author: jvincec <jvincec@simple.biz>
Date:   Sat Apr 18 02:45:28 2026 +0800

    fix(migrations): rename migration file for chronological application in ci-cd pipeline

[33mcommit 52f46440eb871faa4681bdbae46635fed331745e[m
Author: jvincec <jvincec@simple.biz>
Date:   Sat Apr 18 02:42:37 2026 +0800

    feat(sync): add pre-sync sheet backup metadata persistence

[33mcommit 07b89dde131965dc221a3d5bcc8203df8cfe8a33[m
Merge: 4b75f35 e8f80ca
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Apr 17 12:20:41 2026 -0400

    Merge pull request #150 from Simple-biz/codefix/rep-docs
    
    updated order sequence for unassinged hearings

[33mcommit e8f80caa5d3aee9c1c814919f1f1369fced0206a[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Apr 17 12:13:58 2026 -0400

    updated order sequence for unassinged hearings

[33mcommit 9812e1309988eef540c38a0b4fa5833b3c767b18[m
Author: jvincec <jvincec@simple.biz>
Date:   Fri Apr 17 22:50:23 2026 +0800

    Persist latest MR sync history across refresh and track sync actor

[33mcommit 4b75f351723b7a80597d4d1e08f27c3d1628a2b6[m
Merge: bccbc48 b53fdbe
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Apr 17 10:07:05 2026 -0400

    Merge pull request #148 from Simple-biz/feature/rep-schedule-summary
    
    added rep schedule lock summary modal

[33mcommit b53fdbea389e25f9d4722a80b24154377c7d8f23[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Apr 17 10:05:35 2026 -0400

    added rep schedule lock summary modal

[33mcommit bccbc48f43aff635ef8a9d07d38e25ef53d404d1[m
Merge: 55a45ab f03ef12
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Apr 17 09:21:35 2026 -0400

    Merge pull request #146 from Simple-biz/feature/reps-docs
    
    added notes panel inside details panel

[33mcommit f03ef124aabd1627c1ed1d69e1bf80269551f3a1[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Apr 17 09:06:54 2026 -0400

    added notes panel inside details panel

[33mcommit 55a45ab695c9087a98777918a3f0315373e66485[m
Merge: 75adf78 e6a2d36
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Apr 17 08:40:57 2026 -0400

    Merge pull request #144 from Simple-biz/feature/reps-docs
    
    Feature/reps docs

[33mcommit e6a2d36366e5b68b711b951c8df0af1cae7b06db[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Apr 17 08:30:04 2026 -0400

    added changes notif

[33mcommit 47da8da7d3d4c23c7f473f1ece2e8bce4f842104[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Apr 17 08:21:34 2026 -0400

    added details and comments panel

[33mcommit dc3bd9a6deb7ab1c9c0375892e7a97f56deb3ffb[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Apr 16 17:22:26 2026 -0400

    added row expand detailed panel

[33mcommit ce57ade2960992b694645a655152d7c9de12e94a[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Apr 16 17:03:32 2026 -0400

    added withdrawn indicators

[33mcommit 6e75a9448ec2df06e87c290b0f44c26bed94dead[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Apr 16 16:31:40 2026 -0400

    adjusted all assginee dropdowns

[33mcommit e02087af96904c4893cbb851f6454f717c03f664[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Apr 16 08:21:20 2026 -0400

    added rep docs cards and additional filters

[33mcommit 9b9c45a1ac94d317c674bc2f4c735da25c481409[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Wed Apr 15 10:25:05 2026 -0400

    updated the rep badge and adjusted the date stamp

[33mcommit 75adf780b77eb8877f04f1d06a8349bdeff31439[m
Merge: 8111f15 b09e004
Author: jerup-dev <jerup@simple.biz>
Date:   Tue Apr 14 15:42:26 2026 -0400

    Merge pull request #142 from Simple-biz/feature/reps-docs
    
    fixed ovh link editable access

[33mcommit b09e004a41d9324e8a0cdf85264be359009a3741[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Apr 14 15:40:13 2026 -0400

    fixed ovh link editable access

[33mcommit 8111f15473d892c73ffd34a8110aeec0e183c487[m
Merge: 7234c9a 01e49ca
Author: jerup-dev <jerup@simple.biz>
Date:   Tue Apr 14 15:23:15 2026 -0400

    Merge pull request #140 from Simple-biz/feature/reps-docs
    
    fix eslint

[33mcommit 01e49ca1e34021feef84f606d6b75de3d2835ce4[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Apr 14 15:22:08 2026 -0400

    fix eslint

[33mcommit 7234c9ac22ce855a9ed36ddd61f1d3ecead7614e[m
Merge: c505f16 9da9c65
Author: jerup-dev <jerup@simple.biz>
Date:   Tue Apr 14 15:15:26 2026 -0400

    Merge pull request #138 from Simple-biz/feature/reps-docs
    
    Feature/reps docs added to cc in user creation

[33mcommit 9da9c65e61eeb0471448d95e38ad1e39e34cf22a[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Apr 14 15:12:45 2026 -0400

    fixed to cc in user creation

[33mcommit 43c4f17fffcc887074a22d68addfc5c065052805[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Apr 14 14:16:17 2026 -0400

    added rep docs page

[33mcommit fa3ff0fe269b9e052ebe08875aa8451c8fc8eba8[m
Author: jvincec <jvincec@simple.biz>
Date:   Wed Apr 15 00:28:24 2026 +0800

    fix(db): restore query compatibility while keeping transaction support

[33mcommit 884b75a196e1b746dd262be4d179917e27a9f86f[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Apr 14 23:04:27 2026 +0800

    fix(types): resolve import portal build errors after DB typing updates

[33mcommit 856ba3334a08870002114e397fdb6ba9ade27213[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Apr 14 21:59:46 2026 +0800

    feat(sync): wire MR page updates into event-driven Google Sheets sync and fix import portal typing

[33mcommit 978893627b7f0f785adf23d7e2e2ab0919d98709[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Apr 14 15:25:16 2026 +0800

    feat(sync): migrate Google Sheets sync to event-driven workflow and wire MR page updates

[33mcommit c505f16776933fcd6f9631c3fce9388e7827cb9d[m
Merge: b91bda0 0375bb1
Author: jerup-dev <jerup@simple.biz>
Date:   Mon Apr 13 16:16:49 2026 -0400

    Merge pull request #136 from Simple-biz/feature/dashboard-updates-v2
    
    added rep view for admins

[33mcommit 0375bb117847859b92d8dfce697162ac12c0f358[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Mon Apr 13 16:13:47 2026 -0400

    added rep view for admins

[33mcommit b91bda069c375a4238b1b7ae776ce8323fda1a2a[m
Merge: 0aab15e b68a112
Author: jerup-dev <jerup@simple.biz>
Date:   Mon Apr 13 15:02:12 2026 -0400

    Merge pull request #134 from Simple-biz/feature/dashboard-updates-v2
    
    Feature/dashboard updates v2 added rescheduled and chronicle link feature

[33mcommit b68a1122d580c64f6f046e7caee7ee2b26badf19[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Mon Apr 13 14:57:48 2026 -0400

    added ovh link

[33mcommit 391303e83ad8bb0c1f28e8e485ffc6ba6b851a3e[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Mon Apr 13 14:29:29 2026 -0400

    added ovh link

[33mcommit 0aab15ec994492d4f94ee9fa4a42367fd7ccab8b[m
Merge: 2b6f4f6 4afb4c9
Author: jerup-dev <jerup@simple.biz>
Date:   Mon Apr 13 13:03:15 2026 -0400

    Merge pull request #132 from Simple-biz/feature/dashboard-updates-v2
    
    added rescheduled and chronicle link feature

[33mcommit 4afb4c9f15d1df0ee9070d778ef96088de2d3cd5[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Mon Apr 13 12:58:22 2026 -0400

    added chronicle link feature

[33mcommit 472264bef8a46779510195fc900ccb9e175dfe67[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Mon Apr 13 11:41:57 2026 -0400

    updated resched update

[33mcommit 3bf19d4abab133f46585f44a9ef37a4a293b8651[m
Author: jvincec <jvincec@simple.biz>
Date:   Mon Apr 13 21:08:20 2026 +0800

    fix: wire withdrawn/post-HRG worksheet links and improve Google Sheets sync

[33mcommit 2b6f4f68fb5f91583d165df57605db41c2fb83f2[m[33m ([m[1;32mdevelop[m[33m)[m
Merge: 8cb6578 6ac2aaa
Author: jerup-dev <jerup@simple.biz>
Date:   Mon Apr 13 08:21:03 2026 -0400

    Merge pull request #130 from Simple-biz/feature/post-hrg-development
    
    fix import compare api route

[33mcommit 6ac2aaa1e882d700e8d4efd5fccfab1eba05d41f[m[33m ([m[1;31morigin/feature/post-hrg-development[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Mon Apr 13 08:18:52 2026 -0400

    fix import compare api route

[33mcommit 8cb6578cca7570cf98abd9dd637e66c051c6e077[m
Merge: b84b346 a21ea11
Author: jerup-dev <jerup@simple.biz>
Date:   Mon Apr 13 07:59:18 2026 -0400

    Merge pull request #128 from Simple-biz/feature/post-hrg-development
    
    added post hrg review modal and added remarks modal

[33mcommit a21ea11f4c560d6b1c7ca2cfab89bb8eedb5af17[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Apr 10 17:29:38 2026 -0400

    added post hrg review modal and added remarks modal

[33mcommit b84b3469f5be3684eb2cd5276cd244fe8c90dd7d[m
Merge: 14d496b c59571a
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Apr 10 14:09:13 2026 -0400

    Merge pull request #126 from Simple-biz/feature/post-hrg-development
    
    implemented tanstack in post hrg dev page

[33mcommit c59571adba0da5cf55b6adc0e05b4c6982fe5b64[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Apr 10 14:06:09 2026 -0400

    fixed system admin view

[33mcommit d2297eab050dd19daedbaa607d0f6179bc28f18d[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Apr 10 14:01:04 2026 -0400

    implemented tanstack in post hrg dev page

[33mcommit 14d496b395d7d2026278788af599c93be96c63b8[m
Merge: 1c9ad5d d4bdc1d
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Apr 10 10:52:43 2026 -0400

    Merge pull request #124 from Simple-biz/feature/post-hrg-development
    
    Feature/post hrg development

[33mcommit d4bdc1d61b7c7bec54b050593f418f16f217f348[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Apr 10 10:31:37 2026 -0400

    fixed post hrg table ui and added filters and restriction

[33mcommit b0d6ec16f3850e7ca5e239b9f1b06a0288bd1750[m
Author: jvincec <jvincec@simple.biz>
Date:   Fri Apr 10 09:50:39 2026 +0800

    fix(mr-sync): fix task_assigned log type, add post_hrg_deadline logging, create sync_watermarks table
    
    - toggleTaskAssigned was logging under 'five_day_notice_updated' — now correctly uses 'task_assigned_updated'
    - updatePostHrgDeadline had no logActivity call — added with clear/set messaging
    - getActivityLog whitelist updated to include both new action types
    - sync_watermarks migration: replaces hardcoded 2-hour N8N window with a
      persistent watermark so edits are never silently dropped between syncs

[33mcommit 73ae032248a739786e35a96f0b3b29a93dd71e0e[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Apr 9 16:13:11 2026 -0400

    Remove .claude from repo and add to gitignore

[33mcommit 64a2adc193d1d32b110952542ee2dd50fc73cba1[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Apr 9 16:09:23 2026 -0400

    updated gitignore

[33mcommit 206ebc1c871b39675a7b87efac2eee4fd27dd6f1[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Apr 9 16:06:05 2026 -0400

    added post hrg development page

[33mcommit 6ce6c64fc6dffc0167e86bd30c1c0d8a15a73f5a[m
Merge: 953bf1c 1c9ad5d
Author: jvincec <jvincec@simple.biz>
Date:   Thu Apr 9 23:49:56 2026 +0800

    Merge branch 'develop' of github.com:Simple-biz/hsl-hearing-dashboard into feature/mr-pivot-to-google-sheet-sync

[33mcommit 953bf1c28d0cde7300d39e3a6f23a60934e97bee[m
Author: jvincec <jvincec@simple.biz>
Date:   Thu Apr 9 23:28:21 2026 +0800

    Remove unused hook

[33mcommit 221cf298d080ae6bbbdee52cadda35df5ab9588d[m
Author: jvincec <jvincec@simple.biz>
Date:   Thu Apr 9 23:26:42 2026 +0800

    feat(mr-sync): enable delta sync tracking and fix 5-day notice state
    
    - DB/Actions: Appended updated_at = NOW() to all hearing update queries. This ensures the n8n Delta Sync architecture can accurately detect and fetch only recently modified rows, preventing OOM crashes.
    
    - Frontend: Imported and mapped toggleFiveDayNotice in the client actions array so UI checkbox updates correctly persist to Postgres.
    
    - API: Increased SYNC_TIMEOUT_MS from 25s to 55s to maximize Vercel Pro execution limits for larger payloads, with contextual documentation added.
    
    - UI: Fixed a minor Tailwind z-index syntax error (z-[70] -> z-70) in the Change History modal's error toast.

[33mcommit 1c9ad5d84ce02234d5190f2ae459dc7bea337602[m
Merge: 75a086e c024c89
Author: jerup-dev <jerup@simple.biz>
Date:   Wed Apr 8 14:32:31 2026 -0400

    Merge pull request #122 from Simple-biz/feature/import-compare
    
    added import compare page

[33mcommit c024c8978ac64def9e98a681b885e6b7b620dc78[m[33m ([m[1;31morigin/feature/import-compare[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Wed Apr 8 14:30:51 2026 -0400

    added import compare page

[33mcommit 75a086ebe371d5b83b5b78c1bdd680cecaf736ae[m
Merge: 05f0137 7641bfd
Author: jerup-dev <jerup@simple.biz>
Date:   Wed Apr 8 12:00:54 2026 -0400

    Merge pull request #120 from Simple-biz/feature/post-hrg-updates
    
    update notes view

[33mcommit 7641bfd7fffd2bad4667abd9ee67c0f14378024e[m[33m ([m[1;31morigin/feature/post-hrg-updates[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Wed Apr 8 11:57:22 2026 -0400

    update notes view

[33mcommit 05f01379cbf7eb1c133e852c6958181baf7c946d[m
Merge: 8bef47b b8f5bdb
Author: jerup-dev <jerup@simple.biz>
Date:   Wed Apr 8 11:11:57 2026 -0400

    Merge pull request #118 from Simple-biz/feature/post-hrg-updates
    
    added post hrg dev status column and updated post hrg modal

[33mcommit b8f5bdb18f1bb5af8d0df3ebf94640789802c173[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Wed Apr 8 08:35:49 2026 -0400

    added post hrg dev status column and updated post hrg modal

[33mcommit 2d3fefaf8b8a244560d7764a3f96beab2a61e203[m
Author: jvincec <jvincec@simple.biz>
Date:   Wed Apr 8 10:51:38 2026 +0800

    feat(mr-sync): improve sync UX and abstract user-facing errors
    
    Move the Google Sheets sync action to the nav action area for better hierarchy.
    
    Replace inline raw sync errors with a toast-style notification and keep technical details in logs.
    
    Update the MR sync API route to return cleaner user-facing error messages.

[33mcommit ba75ff02c50d7b3339f6cfd3faa1ece98979b332[m
Merge: 186e540 8bef47b
Author: jvincec <jvincec@simple.biz>
Date:   Wed Apr 8 09:32:12 2026 +0800

    Resolve merge conflicts

[33mcommit 186e5400de23b6b7751fb9f0314c7a4e96308e39[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Apr 7 23:52:05 2026 +0800

    Update comments

[33mcommit 3473e84af5e0db899e38796ad6705a07b0fe15f4[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Apr 7 22:21:10 2026 +0800

    feat: add MR Pivot Google Sheets sync modal and API integration

[33mcommit 8bef47b3100a854c7689f1f96de6a9a334635838[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Apr 7 04:08:10 2026 -0400

    code cleanup

[33mcommit 8a8a7e6350e637908942cb390e4e2fdbe1c457a4[m
Merge: e0e86ea 28f0283
Author: jerup-dev <jerup@simple.biz>
Date:   Tue Apr 7 03:56:40 2026 -0400

    Merge pull request #115 from Simple-biz/feature/import-portal
    
    Feature/import portal

[33mcommit 28f0283438ffc7fa8653746378feb9d991dd1530[m[33m ([m[1;31morigin/feature/import-portal[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Apr 7 03:54:39 2026 -0400

    added got mr notes

[33mcommit e1613788e51a385dd271f87f162db6f870354402[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Apr 7 11:24:17 2026 +0800

    feat(medical-records): wire GoogleSheetsSyncButton into MR Pivot toolbar

[33mcommit 0f4bc619e0402fab1a41a3b2f83a499093f06052[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Apr 7 11:23:41 2026 +0800

    feat(modals): add GoogleSheetsSyncButton and ChangeHistoryModal components

[33mcommit 71aba88a98757af1e0f23e3e41e5493f91a256cb[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Apr 7 11:23:37 2026 +0800

    feat(api): add /api/mr-sync route — proxies sync trigger to n8n webhook

[33mcommit 9f0de3eaae3595df5e7d3aed1cbd0c3e25e84e50[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Apr 7 11:23:32 2026 +0800

    feat(roles): add canSyncGoogleSheets permission for mr-sync

[33mcommit 8e7c05656b0766396bd191c8d2634f819d14a1f3[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Mon Apr 6 16:30:12 2026 -0400

    implemented import patient portal

[33mcommit e0e86eaca2d140cd7f1b7df036ef8adadb757482[m
Merge: 6aa753f 0cbce08
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Apr 3 14:09:35 2026 -0400

    Merge pull request #113 from Simple-biz/feature/import-rfc
    
    fixed validateDate in import rfc

[33mcommit 0cbce08a799a83163292599e60160aa99027f039[m[33m ([m[1;31morigin/feature/import-rfc[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Apr 3 14:07:17 2026 -0400

    fixed validateDate in import rfc

[33mcommit 6aa753fc057273d82ece12324940ce52159dd29b[m
Merge: af45150 9b28bef
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Apr 3 13:31:20 2026 -0400

    Merge pull request #111 from Simple-biz/feature/import-rfc
    
    added import rfc and fixed comments section

[33mcommit 9b28bef1bc642e57f28a1b16042170ea1a9a8272[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Apr 3 13:29:45 2026 -0400

    added import rfc and fixed comments section

[33mcommit af45150618b5d2d44db36920c13a96e967ff9b12[m
Merge: a5bb06b b88ad66
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Apr 3 11:49:26 2026 -0400

    Merge pull request #109 from Simple-biz/feature/mr-page-pie-chart
    
    added mr reports page

[33mcommit b88ad66c2b9607ee6789031286e06c79cb4d509f[m[33m ([m[1;31morigin/feature/mr-page-pie-chart[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Apr 3 11:39:45 2026 -0400

    added mr reports page

[33mcommit a5bb06be97c14bc55cb36c57d059bcaee2c9c24b[m
Merge: 32ab0e3 03843e5
Author: jerup-dev <jerup@simple.biz>
Date:   Thu Apr 2 15:59:43 2026 -0400

    Merge pull request #107 from Simple-biz/codefix/mr-pivot-dashboard
    
    Codefix/mr pivot dashboard

[33mcommit 03843e56870f728e01ea9d0bea0263694dbe6f72[m[33m ([m[1;31morigin/codefix/mr-pivot-dashboard[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Apr 2 15:58:01 2026 -0400

    updated month filter and dropdown background

[33mcommit ce9ca2d2c320660b7baed6d7362aa25d962acb9c[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Apr 2 15:32:22 2026 -0400

    update month filter and dropdown background

[33mcommit 32ab0e30bd25836da8688ef5483ff5199a56db2e[m
Merge: 6c0adca 50b4db7
Author: jerup-dev <jerup@simple.biz>
Date:   Thu Apr 2 13:53:34 2026 -0400

    Merge pull request #105 from Simple-biz/update/dashboard-hearings-archiving
    
    fixed reset password

[33mcommit 50b4db7e618f506c7842f2b5e55d93df29a3f667[m[33m ([m[1;31morigin/update/dashboard-hearings-archiving[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Apr 2 13:52:08 2026 -0400

    fixed reset password

[33mcommit 6c0adca93bbf4363305579383509149a073e67e5[m
Merge: 15270ac dfac259
Author: jerup-dev <jerup@simple.biz>
Date:   Thu Apr 2 13:32:28 2026 -0400

    Merge pull request #103 from Simple-biz/update/dashboard-hearings-archiving
    
    Update/dashboard hearings archiving and tooltips and added roles and restriction

[33mcommit dfac2594256c3e183daf20484c34e7728e61d6b3[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Apr 2 13:29:48 2026 -0400

    updated tooltips and added roles and restriction

[33mcommit 5514cc8676e23ce2652a80f869e5b867ce6e7053[m
Author: jvincec <jvincec@simple.biz>
Date:   Thu Apr 2 23:39:49 2026 +0800

    Remove redundant comments

[33mcommit b8bb17fad3c3dc232f653f221c4437c61d7b2a14[m
Author: jvincec <jvincec@simple.biz>
Date:   Thu Apr 2 10:27:58 2026 +0800

    Add a hook for general usage n8n webhook sync

[33mcommit 3f25fc8145a83b321ed13df25f621da4d1b9b2ce[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Wed Apr 1 17:39:50 2026 -0400

    added hearings archive

[33mcommit 15270aca52ad8746f0304e9b19755788b9c82519[m
Merge: abb8a54 d9e3297
Author: jerup-dev <jerup@simple.biz>
Date:   Wed Apr 1 16:21:45 2026 -0400

    Merge pull request #100 from Simple-biz/update/dashboard-client
    
    adjusted column sequence

[33mcommit d9e32979daf79c4d217d083669e5d32ba6031dcc[m[33m ([m[1;31morigin/update/dashboard-client[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Wed Apr 1 16:20:33 2026 -0400

    adjusted column sequence

[33mcommit abb8a5482c0104082c18166cfbcb5d4ca888c78a[m
Merge: e159f82 ffb29fd
Author: jerup-dev <jerup@simple.biz>
Date:   Wed Apr 1 15:40:06 2026 -0400

    Merge pull request #98 from Simple-biz/codefix/activity-log
    
    updated activity log

[33mcommit ffb29fdc76ada34b1f86c693b7a8123521d3d7a5[m[33m ([m[1;31morigin/codefix/activity-log[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Wed Apr 1 15:36:55 2026 -0400

    updated activity log

[33mcommit e159f82fd74932c17e52fd26c423bc6d75203743[m
Merge: c9ece74 4e5271d
Author: jerup-dev <jerup@simple.biz>
Date:   Wed Apr 1 14:59:15 2026 -0400

    Merge pull request #96 from Simple-biz/codefix/csv-compare
    
    added auto refresh and archiving for skipped section

[33mcommit 4e5271dfbe462656735c637c20fa501d5ffb5ccf[m[33m ([m[1;31morigin/codefix/csv-compare[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Wed Apr 1 14:53:09 2026 -0400

    added auto refresh and archiving for skipped section

[33mcommit c9ece7434bdada0fa3a044c0017d3374d7f04715[m
Merge: 6ca739f fece227
Author: jerup-dev <jerup@simple.biz>
Date:   Tue Mar 31 16:07:46 2026 -0400

    Merge pull request #94 from Simple-biz/codefix/csv-compare
    
    added auto refresh when archiving

[33mcommit fece227889eae2cc052f9223e5e95a2e7814ee75[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Mar 31 16:06:24 2026 -0400

    added auto refresh when archiving

[33mcommit 6ca739ff8100f5851702ede99cb5e91d1f6db449[m
Merge: 67c8353 b447cb4
Author: jerup-dev <jerup@simple.biz>
Date:   Tue Mar 31 14:52:07 2026 -0400

    Merge pull request #92 from Simple-biz/codefix/csv-compare
    
    added search inside csv-compare

[33mcommit b447cb434a25b4d561752cf57c15f882d7549c1f[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Mar 31 14:50:14 2026 -0400

    added search inside csv-compare

[33mcommit 67c8353f692c9afdddf183e7214520eadc04bd0c[m
Merge: 60b506b d3ef823
Author: jerup-dev <jerup@simple.biz>
Date:   Tue Mar 31 14:29:55 2026 -0400

    Merge pull request #90 from Simple-biz/codefix/csv-compare
    
    added export in the csv compare modal

[33mcommit d3ef823935c5de9708a9a76f8b1400f7e67c8599[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Mar 31 14:28:17 2026 -0400

    added export in the csv compare modal

[33mcommit 60b506b8ae280a1ea9d1d1692af74fe94a2ad7f7[m
Merge: c55325e a16729f
Author: jerup-dev <jerup@simple.biz>
Date:   Tue Mar 31 13:41:48 2026 -0400

    Merge pull request #88 from Simple-biz/codefix/cron-job-update
    
    code cleanup and updated cron reminder

[33mcommit a16729f091124897d03cc47746df01f5cca242e5[m[33m ([m[1;31morigin/codefix/cron-job-update[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Mar 31 13:35:03 2026 -0400

    code cleanup and updated cron reminder

[33mcommit c55325ea8a7d1f1a67376f961352acef09b4275c[m[33m ([m[1;32mfeature/mock-up-56-day-notification-banner[m[33m)[m
Merge: bf2eafb 7d499b0
Author: jerup-dev <jerup@simple.biz>
Date:   Tue Mar 31 11:32:46 2026 -0400

    Merge pull request #76 from Simple-biz/feature/codefix-patch-mrpivot-rfc-and-patient-portal
    
    Resolve UI and functionality issues

[33mcommit 7d499b095c1a0eac18ee261cfe10ad06c5a3d65f[m[33m ([m[1;31morigin/feature/codefix-patch-mrpivot-rfc-and-patient-portal[m[33m, [m[1;32mfeature/codefix-patch-mrpivot-rfc-and-patient-portal[m[33m)[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Mar 31 23:29:38 2026 +0800

    Remove unused header constants and fix lint errors

[33mcommit bf2eafb8fdcb2abac81b7b2085d3cd2ee235960a[m
Merge: 4ae3234 582e484
Author: jerup-dev <jerup@simple.biz>
Date:   Tue Mar 31 09:53:42 2026 -0400

    Merge pull request #85 from Simple-biz/codefix/admin-activity-logs
    
    add activity logs for user creation

[33mcommit 582e484d3399727d3105f7f2d159ccb8c02d5e14[m[33m ([m[1;31morigin/codefix/admin-activity-logs[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Mar 31 09:47:00 2026 -0400

    add activity logs for user creation

[33mcommit faa80b26d1a592165c5cab0138f93f42c8c7e0a1[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Mar 31 11:48:33 2026 +0800

    fix(rfc): move Back to MR Pivot button above stat cards, matching patient portal layout

[33mcommit 3153e6c75d8999293cdc424e04b841729c35c1fa[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Mar 31 11:25:44 2026 +0800

    feat(mr-page): hyperlink claimant names using claimant_link from hearings table
    
    Added claimant_link to Hearing type, SQL query, and row rendering.
    Names link to MyCase when claimant_link exists, plain text otherwise.

[33mcommit a176223bffe52b4fc2f5f820546615ab07aa4b3a[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Mar 31 06:25:46 2026 +0800

    fix(mr-page): widen Task Assigned/Hearing Date columns, add whitespace-nowrap to headers, center Claimant header

[33mcommit 4ae3234b076cd27287f7db9bf0fb53d72b377699[m
Merge: 9c6e45e 4cb24a8
Author: jerup-dev <jerup@simple.biz>
Date:   Mon Mar 30 16:40:47 2026 -0400

    Merge pull request #83 from Simple-biz/codefix/dashboard-rep-view
    
    removed withdrawal hearings in the reps dashboard view

[33mcommit 4cb24a84860dc509640cf1aa271b6eb4d7158aec[m[33m ([m[1;31morigin/codefix/dashboard-rep-view[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Mon Mar 30 16:32:44 2026 -0400

    removed withdrawal hearings in the reps dashboard view

[33mcommit 9c6e45e3269fd12ce293cd17df3c4c92e268da2f[m
Merge: 4e43ca4 af7531e
Author: jerup-dev <jerup@simple.biz>
Date:   Mon Mar 30 13:56:30 2026 -0400

    Merge pull request #81 from Simple-biz/feature/bulk-user-creation
    
    added bulk user creation

[33mcommit af7531e210658a94b5d1e75b818590674ad56dd5[m[33m ([m[1;31morigin/feature/bulk-user-creation[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Mon Mar 30 13:54:04 2026 -0400

    added bulk user creation

[33mcommit 4e43ca4fe2d6137b90fc9d5e3503b526b54e44fd[m
Merge: e66fa02 1a7a519
Author: jerup-dev <jerup@simple.biz>
Date:   Mon Mar 30 11:20:27 2026 -0400

    Merge pull request #79 from Simple-biz/codefix/login
    
    updated login page

[33mcommit 1a7a51949a80060a4ab5e0ae13878e65b85e8961[m[33m ([m[1;31morigin/codefix/login[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Mon Mar 30 11:18:56 2026 -0400

    updated login page

[33mcommit e66fa026165a3e95ace7e7838f9dccb233946357[m
Merge: 059e9a0 ab54d90
Author: jerup-dev <jerup@simple.biz>
Date:   Mon Mar 30 09:05:44 2026 -0400

    Merge pull request #77 from Simple-biz/feature/import-raw-fix
    
    Feature/import raw fix

[33mcommit ab54d90aed1e1b4b7b7d773a618aead12d955016[m[33m ([m[1;31morigin/feature/import-raw-fix[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Mon Mar 30 08:57:16 2026 -0400

    fixed ESLint warning

[33mcommit 45c3ce9246ac00c748a1cac4963ada9f534c0178[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Sat Mar 28 04:29:09 2026 -0400

    added archive reschedule date edit field for skipped hearings

[33mcommit 40e99179f90a79f957d329d43ffabd4605c73426[m
Author: jvincec <jvincec@simple.biz>
Date:   Sat Mar 28 14:14:26 2026 +0800

    fix(rfc-documents): convert to CSS grid, fix column alignment, theme-safe headers
    
    Converted main table and View Details desktop section from HTML table to
    CSS grid. RfcRow returns grid div with shared gridTemplateColumns.
    
    Fixed View Details desktop section — header and rows were using different
    grid widths causing misalignment. Now all three grids (RfcRow, main table
    header, View Details header) use identical column widths.
    
    Merged View Details header and body into single scroll container with
    sticky header for mobile scroll sync.
    
    Column alignment per spec:
    - Centered headers + left content: Date, Client Name, Provider
    - Left aligned: Hearing Date, Date Signed, Date Received
    - Fully centered: MR Team, Doc Type, MyCase, Method, Filed OHO, Appr. TL, Del
    
    Added whitespace-nowrap to View Details headers. Widened Filed OHO to 80px.
    Header bg changed from hardcoded #4a5568 to bg-muted for dark mode.
    Fixed hydration error: removed table/tbody wrapper around grid-based RfcRow.

[33mcommit 23194fd97784df9f776e9774251956425453cb6e[m
Author: jvincec <jvincec@simple.biz>
Date:   Sat Mar 28 13:03:11 2026 +0800

    fix(post-hrg-modal): center Post HRG and Link columns, + Link empty state, fix Invalid Date
    
    Centered Post HRG header and cell content (justify-center).
    Link column: empty state changed from — to + Link, added whitespace-nowrap.
    fmtDate made more robust — handles Date objects directly, strips timezone
    from ISO strings, returns — instead of Invalid Date for unparseable values.

[33mcommit 95d6ec7927aaa67d6b19c03179e907d26cd69738[m
Author: jvincec <jvincec@simple.biz>
Date:   Sat Mar 28 12:19:39 2026 +0800

    fix(withdrawn-modal): center column contents, + Link empty state, fix compressed link column
    
    Centered all table cell contents except Claimant (left-aligned).
    Link column empty state changed from — to + Link matching other modals.
    Added whitespace-nowrap to Link td and bumped table minWidth to 920px
    to prevent compressed layout.

[33mcommit af766bd45c3466609382bc27f85ac114efc31e71[m
Author: jvincec <jvincec@simple.biz>
Date:   Sat Mar 28 11:33:59 2026 +0800

    fix(hearings-modal): rename Worksheet to MR Worksheet, empty state shows + Link
    
    Header renamed from Worksheet to MR Worksheet matching MR page.
    Empty state changed from — to + Link matching hearings table style.

[33mcommit d05df3e427264672bf25c5e0f0af1cb6bce9764e[m
Author: jvincec <jvincec@simple.biz>
Date:   Sat Mar 28 11:06:04 2026 +0800

    fix: expand/collapse chevron contrast for light and dark mode
    
    Light mode: black button + white text (bg-zinc-900 text-white)
    Dark mode: white button + black text (dark:bg-white dark:text-zinc-900)
    
    Applied to all 3 instances: hearings detail view modal, MR page month
    toggles, MR page team toggles.

[33mcommit c0161dddc84b4b2f1ecd4967a41eed754343b511[m
Author: jvincec <jvincec@simple.biz>
Date:   Sat Mar 28 10:13:41 2026 +0800

    fix(hearings-modal): role-based permissions for Post HRG notes, chevron visibility
    
    Post HRG permissions:
    - Added userRole prop to HearingsModal and PostHrgInlineModal
    - canEditNotes now checks against full allowed role list matching server-side
      (system_admin, admin, manager, mr_admin, mr_lead, mr_agent,
      post_hearing_admin, post_hearing_staff)
    - Passed userRole from MrPivotClient through to HearingsModal
    
    Chevron visibility:
    - Expand/collapse badges now use bg-white dark:bg-zinc-200 with dark text
      for visibility in dark mode across hearings modal and MR page
    - Text size increased to text-sm, badge size kept compact

[33mcommit 2956e10828448fb4750221a8f5e0e254557e48ad[m
Author: jvincec <jvincec@simple.biz>
Date:   Sat Mar 28 09:33:03 2026 +0800

    fix(hearings-modal): 5-Day and Post HRG columns now interactive
    
    5-Day: replaced static ✓/— with interactive checkbox matching MR page,
    wired to toggleFiveDayNotice server action, disabled for view-only roles.
    
    Post HRG: replaced static badge with clickable 📝 + Add / Notes button.
    Opens PostHrgInlineModal with deadline picker, add note form, and notes
    history. Permission-guarded via canEditNotes (canManage).
    
    Added toggleFiveDayNotice, getPostHrgNotes, addPostHrgNote,
    updatePostHrgDeadline to imports. Added postHrgHearing state and
    __open_post_hrg signal in handleUpdate. Added five_day_notice to
    the actions dispatch map.

[33mcommit 4457390b61b1b94111f5e1cd5450af459123c51e[m
Author: jvincec <jvincec@simple.biz>
Date:   Sat Mar 28 09:10:27 2026 +0800

    fix(hearings-modal): column alignment, centering, responsive grid, scroll sync
    
    - Fixed header/row column mismatch: header had 11 labels but row grid had
      12 slots, causing all columns after Credited to shift right
    - Corrected column widths: Credited 120px→55px (checkbox), HRG Decision
      40px→130px (dropdown), renamed Status header to HRG Decision
    - Centered all header labels and row content except Claimant (left-aligned)
    - Switched grid from fixed px to minmax(px,fr) so columns stretch to fill
      modal width on desktop while maintaining minimum sizes on mobile
    - Merged header and rows into single overflow-auto container with sticky
      header — fixes mobile scroll sync where header and content scrolled
      independently

[33mcommit eb0de473997496266451abd98290c1d5eef27f14[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Mar 27 17:44:24 2026 -0400

    updated csv compare with aditional validations for new and rescheduled

[33mcommit 91a0e845d98a7989a9754a436747d0ce9e374d66[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Mar 27 12:51:40 2026 -0400

    updated import raw and csv compare

[33mcommit 6ceefa9db7ba53925de6f551da6711c5d95d8e34[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Mar 26 16:53:09 2026 -0400

    added add edit modal for claimant link and mr worksheet link

[33mcommit 589e974592645a4d98e67828e24e9aab0070ed0a[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Mar 26 15:54:05 2026 -0400

    updated import raw and import hearings

[33mcommit 059e9a00d256d14a5598d09c5cca5b5254b84d5e[m
Merge: 67a1abf 4723ced
Author: jerup-dev <jerup@simple.biz>
Date:   Thu Mar 26 12:02:49 2026 -0400

    Merge pull request #62 from Simple-biz/feature/codefix-patch-mrpivot-rfc-and-patient-portal
    
    Medical Records, RFC and patient portal adjustments and fixes

[33mcommit 4723cede47a4cf39f1e01efba1fd6c6c62197dfb[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Mar 26 11:38:20 2026 -0400

    updated dashboard client parsing and notes history view

[33mcommit 9bff2a32cbb0cd0482271228ffc485bfc817f605[m
Merge: c711125 6d1e566
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Mar 26 08:38:54 2026 -0400

    Merge branch 'feature/codefix-patch-mrpivot-rfc-and-patient-portal' of github-work:Simple-biz/hsl-hearing-dashboard into feature/codefix-patch-mrpivot-rfc-and-patient-portal

[33mcommit 6d1e566aad32da50d5cb31046afa1f09f8d6b13d[m
Author: jvincec <jvincec@simple.biz>
Date:   Thu Mar 26 18:05:53 2026 +0800

    fix: post HRG notes — atomic writes, auth, permissions, polling, modal fixes
    
    Race condition: replaced client-side read-modify-write with atomic Postgres
    SQL prepend in addPostHrgNote (action.ts) and addDashboardPostHrgNote
    (actions.tsx). Concurrent note additions no longer overwrite each other.
    
    Unknown author: auth.ts JWT callback now persists and refreshes full_name
    from DB. Session callback explicitly maps name. addPostHrgNote falls back
    to DB lookup if session name missing.
    
    Polling: all three note modals (dashboard PostHrgModal, MR PostHrgReviewModal,
    PostHrgModal NotesList) poll every 8s for fresh notes. Uses savingRef synced
    via useEffect (React 19 compatible). Stops on unmount, skips during saves.
    
    Permissions: server-side role check in addPostHrgNote rejects unauthorized
    roles. Client-side canEditNotes hides add/delete UI for view-only roles.
    
    JSON shape: both pages now write { author, date, content }. Parsers handle
    legacy { user, date, note } via noteAuthor/noteContent/noteDate helpers.
    
    Query filter: getPostHrgHearings and postHrgCount include both
    hearing_decision_status and medical_record_status for Post HRG matching.
    
    Modal routing: per-row + Add opens PostHrgReviewModal not PostHrgModal.
    Link icon in PostHrgModal changed to clipboard matching Withdrawn modal.
    System Administrator filter narrowed to System to avoid hiding admin notes.

[33mcommit 18485365f5ab39114fab34b75ec656b32749582b[m
Merge: e7a2d5a 67a1abf
Author: jvincec <jvincec@simple.biz>
Date:   Thu Mar 26 04:03:04 2026 +0800

    Resolve merge conficts

[33mcommit 67a1abfa21e726894babefa5ef95ba5dafef3be6[m
Merge: 98126cd 5c8391d
Author: jerup-dev <jerup@simple.biz>
Date:   Wed Mar 25 15:26:39 2026 -0400

    Merge pull request #74 from Simple-biz/codefix/post-hrg-notes
    
    updated role view and edit access and post hrg notes history

[33mcommit 5c8391dd74ff5f01009a8298568dc35ed3813ac1[m[33m ([m[1;31morigin/codefix/post-hrg-notes[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Wed Mar 25 15:25:04 2026 -0400

    updated role view and edit access and post hrg notes history

[33mcommit e7a2d5a367278ede58ac1a9ef781ad9570f96888[m
Author: jvincec <jvincec@simple.biz>
Date:   Thu Mar 26 03:11:59 2026 +0800

    fix: post HRG notes — race condition, Unknown author, permission guards, modal routing
    
    Post HRG Review modal routing:
    - Per-row + Add button now opens PostHrgReviewModal (small per-hearing modal)
      instead of PostHrgModal (full 178-row table modal)
    - Link column icon in PostHrgModal changed from green S circle to blue clipboard
      icon matching Withdrawn modal
    
    Notes race condition (concurrent writes):
    - Replaced read-modify-write pattern with atomic Postgres SQL prepend in both
      action.ts (addPostHrgNote) and actions.tsx (addDashboardPostHrgNote)
    - Two users adding notes simultaneously no longer overwrite each other
    
    Unknown author fix:
    - auth.ts: JWT callback now stores and refreshes full_name from DB on every
      token refresh; session callback explicitly maps token.name to session.user.name
    - action.ts: addPostHrgNote falls back to DB lookup by user ID if session name
      is missing
    
    JSON shape standardization:
    - Both pages now write canonical { author, date, content } format
    - All parsers handle legacy { user, date, note } shape via fallback helpers
    
    Permission guards (per PDF role matrix):
    - Server-side: addPostHrgNote rejects unauthorized roles before writing
    - Client-side: add note form + delete button hidden for view-only roles across
      PostHrgReviewModal, PostHrgModal NotesList, and dashboard PostHrgModal
    - Allowed: system_admin, admin, manager, mr_admin, mr_lead, mr_agent,
      post_hearing_admin, post_hearing_staff
    
    Post HRG query filter:
    - getPostHrgHearings and postHrgCount now include both hearing_decision_status
      = 'Post HRG Review/ Dev' AND medical_record_status = 'Post Hearing Development'
    
    Missing import fix:
    - Added Permissions import from ./types in medical-records-client.tsx

[33mcommit 98126cd9caea6edb143c58fd498a9dc6c2dbb961[m
Merge: a7fb0ce f25a1e5
Author: jerup-dev <jerup@simple.biz>
Date:   Wed Mar 25 11:44:35 2026 -0400

    Merge pull request #72 from Simple-biz/codefix/import-hearings
    
    added claimant link checker

[33mcommit f25a1e58f1f80f696c5953f989b71903d4ae2a52[m[33m ([m[1;31morigin/codefix/import-hearings[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Wed Mar 25 11:42:23 2026 -0400

    added claimant link checker

[33mcommit a7fb0ce6b3907320e6161ee2c228c1e1d4da8be8[m
Merge: 8e2e5cd 5fae197
Author: jerup-dev <jerup@simple.biz>
Date:   Wed Mar 25 09:54:26 2026 -0400

    Merge pull request #70 from Simple-biz/codefix/import-hearings
    
    Codefix/import hearings

[33mcommit 5fae197c6d059b6278b7952d40ce469d41e90e65[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Wed Mar 25 09:52:56 2026 -0400

    fixed import duplicate error

[33mcommit c71112520af004863538126ca2f417679d69e63e[m
Merge: f3f26da 3f9a469
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Mar 24 13:37:47 2026 -0400

    Merge branch 'feature/codefix-patch-mrpivot-rfc-and-patient-portal' of github-work:Simple-biz/hsl-hearing-dashboard into feature/codefix-patch-mrpivot-rfc-and-patient-portal

[33mcommit 62ae97dd5bcac0369d529f5e0dde13367c04efe2[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Mar 24 13:13:04 2026 -0400

    fixed import hearings rescheduled data

[33mcommit 3f9a4694920fa1fb0b55503f8be14f7521b93fe3[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Mar 24 23:49:18 2026 +0800

    fix(notifications+post-hrg-modal): post-merge fixes
    
    - Fix isPostHrg to trigger on both medical_record_status = 'Post Hearing
      Development' (dashboard) and hearing_decision_status = 'Post HRG Review/ Dev'
      (MR pivot) — was only checking the latter so dashboard changes never fired
    - Remove debug console.log lines from actions.tsx
    - Fix React key warning: replace <> with <Fragment key={h.id}> in post-hrg-modal
    - Add health-check.sh script for post-merge regression checks

[33mcommit a795067f383746cccdb04122da634e8876373be6[m
Merge: 20192eb 8e2e5cd
Author: jvincec <jvincec@simple.biz>
Date:   Tue Mar 24 23:14:06 2026 +0800

    Resolve merge conflicts

[33mcommit 9589aeb1b412237d7d3ae3ec6c1086241f13dbc9[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Mar 24 11:13:27 2026 -0400

    import hearings duplicates fixed

[33mcommit 20192ebf365b51479d447403e216dc3dec2f3f0f[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Mar 24 23:04:25 2026 +0800

    fix(mr-pivot): post-batch-2 fixes
    
    - Fix search placeholder showing literal \u2026 in withdrawn modal
    - Fix post_hrg_review type error: true → 'true' (field is string | null)
    - Fix updateMoa() missing hearingId and manner parameters
    - Center Hearing Date and Time header + cell contents in withdrawn modal
    - Timezone fix: group-date header uses T00:00:00 for local time parsing

[33mcommit 3f59047b567382722303fa19b46e435cfb947208[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Mar 24 22:50:06 2026 +0800

    feat(mr-pivot): client concerns batch 2
    
    Column Layout:
    - Switch grid to fr units for even distribution (no trailing whitespace)
    - Month column widened to 200px to fit group header content without overflow
    - Group header badges (✓ ⏳) no longer overflow into MR Specialist column
    
    Time Formatting:
    - Add fmtTime() to hearings-modal.tsx and unassign-all-modal.tsx
    - Fix timezone bug in group-date header — use T00:00:00 suffix to force
      local time parsing, fixing month mismatch for US timezone users
    
    Withdrawn Modal:
    - Fix opaque column headers: bg-muted/50 → bg-muted
    - Fix all unicode escapes (\u2014, \u2013, \ud83d\udcdd) rendering as
      literal text — replace with actual characters
    - Post HRG cell now shows 📝 + Add / 📝 Notes always visible as a pair
    - Post HRG button opens PostHrgReviewModal inline (deadline + notes)
      without closing the withdrawn modal
    - Add PostHrgReviewModal component with deadline editor and notes history
    
    Post HRG Table Modal:
    - Row no longer expands on any click — expansion only via chevron button
      or clicking the Post HRG date/badge content
    - 5-Day checkbox is now interactive — wired to new toggleFiveDayNotice()
    - Fix updateMoa() missing parameters (hearingId, manner) caused by earlier
      bad str_replace
    
    action.ts:
    - Add toggleFiveDayNotice(hearingId, value) server action
    - Restore updateMoa parameters

[33mcommit 7c2a60c4effc562049bc4a187db70ae919c0fbee[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Mar 24 05:00:15 2026 +0800

    feat(mr-pivot+notifications): client concerns batch 1
    
    MR Team Dropdown:
    - Fix Vicky/Jerome showing same grey as Unassigned — white bg + dark text
      using mr_team_type field (leadership_lead/leadership_asst) for reliable detection
    - Add mr_team_type to optimistic state update so color reflects immediately on change
    - Remove Shared Roles from MR team dropdown and filter bar (team_type = 'shared')
    
    Time Formatting:
    - Add fmtTime() helper to parse DB time strings (HH:MM:SS) into 12hr format (1:00 PM)
    - Apply to all converted_time_est render locations including withdrawn modal and CSV exports
    
    Post HRG Modal:
    - Rewrite PostHrgModal from split-panel to full table layout matching client screenshot
    - Columns: Hearing Date, Time, Claimant, Rep, MR Team, MR Status, Status, MOA, 5-Day, Post HRG, Link
    - Click row to expand inline deadline editor + notes panel
    - Fix getPostHrgHearings to filter hearing_decision_status = 'Post HRG Review/ Dev' (was showing all hearings)
    
    Post HRG Notifications:
    - Add post_hrg to NotificationItem type union
    - Add createPostHrgNotification() to src/lib/notifications.ts
    - Add post_hrg amber badge to app-header TYPE_LABEL
    - Wire both createWithdrawalNotification and createPostHrgNotification into
      updateHearing via static imports (dynamic imports were silently failing)
    - Triggers on hearing_decision_status = 'Post HRG Review/ Dev' from hearing dashboard

[33mcommit 8e2e5cd7e18f9131be326f861bbc939db5dd6093[m
Merge: 066aeff 9517aea
Author: jerup-dev <jerup@simple.biz>
Date:   Mon Mar 23 15:39:40 2026 -0400

    Merge pull request #30 from Simple-biz/feature/patient-portal-page
    
    Migrate and integrate patient portal page in medical records page

[33mcommit 9517aea0db53add0b0e76401d50b9f9e8dd629bd[m[33m ([m[1;31morigin/feature/patient-portal-page[m[33m, [m[1;32mfeature/patient-portal-page[m[33m)[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Mar 24 00:10:59 2026 +0800

    migration: make mr_patient_portal.hearing_id nullable
    
    hearing_id NOT NULL constraint blocks add entry form in Next.js.
    Column is unused post-PHP migration — no FK, no codebase references.
    Reviewed and approved by Jeru P (2026-03-21).
    Rollback instructions included in migration file.

[33mcommit f3f26da3e8fb3a8c9bb79096507f2f329ceb7f2a[m
Merge: 066aeff d39b70d
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Mon Mar 23 10:26:51 2026 -0400

    Merge branch 'feature/codefix-patch-mrpivot-rfc-and-patient-portal' of github-work:Simple-biz/hsl-hearing-dashboard into feature/codefix-patch-mrpivot-rfc-and-patient-portal
    Merge remote updates into feature/codefix-patch-mrpivot-rfc-and-patient-portal
    
    Sync latest changes from remote to keep branch up to date and avoid conflicts.

[33mcommit 480f63471197da1e675c6aa22851ced4a0eab205[m
Author: jvincec <jvincec@simple.biz>
Date:   Sat Mar 21 05:03:28 2026 +0800

    feat(patient-portal): PR review fixes + UI improvements
    
    Permissions:
    - Add system_admin to PortalUserRole and all permission checks (canManage, canEdit, canAssignSpecialist)
    - Fix canAssignSpecialist to match access control PDF: system_admin, admin, manager, mr_admin, mr_lead
    - Update specialist assignment server-side guard to match updated roles
    
    Activity Logs:
    - Scope card-level activity log to specific entry via client_name LIKE filter (no migration needed)
    - Page-level activity log already scoped to PORTAL_ACTIONS only — confirmed no changes needed
    
    UI:
    - Show MR Specialist as dropdown for all canEdit roles (disabled with tooltip for non-canAssignSpecialist)
    - Replace MR Pivot toolbar button with subtle back link above stat cards to avoid misclicks
    - Fix back link overlap by removing negative margin, bump to text-[12px] font-semibold
    - Fix Add Entry button contrast in dark mode: text-white → text-primary-foreground
    - Make column headers bolder: text-[9px] font-semibold → text-[10px] font-extrabold text-foreground
    - Add field update toast notifications matching Hearing Dashboard pattern (emerald green, 3s auto-dismiss)
    
    action.ts:
    - Add entry_id param to getPortalActivityLog for per-entry scoping via description LIKE
    - getPortalActivityLog already filters to portal actions only — no cross-page bleed confirmed

[33mcommit 066aeffe131825100588819d6b7243e8a6a795a7[m
Merge: 94e66a9 6fe099a
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Mar 20 16:22:22 2026 -0400

    Merge pull request #67 from Simple-biz/codefix/user-creation
    
    Codefix/user creation

[33mcommit 6fe099ab683bd10c425c57c006de83f3f7484021[m[33m ([m[1;31morigin/codefix/user-creation[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Mar 20 16:17:36 2026 -0400

    fixed rep user creation

[33mcommit 5e85527a05c7717ef4f395041e230769f60fe5ea[m[33m ([m[1;32mcodefix/user-creation[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Mar 20 13:28:12 2026 -0400

    rep user creation fix

[33mcommit 40e7e7a961c6501c731cee6c8e8c4a22f2c04b37[m
Merge: 97972f0 94e66a9
Author: jvincec <jvincec@simple.biz>
Date:   Fri Mar 20 05:18:32 2026 +0800

    Merge branch 'develop' of github.com:Simple-biz/hsl-hearing-dashboard into feature/patient-portal-page

[33mcommit d39b70deefe729332beef16a1b6c77cf1ebc796d[m
Merge: 9bca782 94e66a9
Author: jvincec <jvincec@simple.biz>
Date:   Fri Mar 20 05:06:17 2026 +0800

    Merge branch 'develop' of github.com:Simple-biz/hsl-hearing-dashboard into feature/codefix-patch-mrpivot-rfc-and-patient-portal

[33mcommit 94e66a9fb573f4e23ad2ad209f65f7edc72ebe27[m
Merge: d64598b d8d6974
Author: jerup-dev <jerup@simple.biz>
Date:   Thu Mar 19 17:05:53 2026 -0400

    Merge pull request #65 from Simple-biz/feature/csv-compare
    
    updated chronicles csv compare

[33mcommit d8d69740cf5cdcfc17e99400c03fc6322804c09e[m[33m ([m[1;31morigin/feature/csv-compare[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Mar 19 17:04:37 2026 -0400

    updated chronicles csv compare

[33mcommit 9bca7827867aef6a47f63bf38b61bca0b0185c7b[m
Author: jvincec <jvincec@simple.biz>
Date:   Fri Mar 20 05:04:36 2026 +0800

    feat(mr-pivot): add field update toast notifications
    
    - Add createPortal-based toast matching Hearing Dashboard pattern
    - Show emerald green popup on every field mutation (MR Status, Decision,
      MR Team, Task Assigned, Credited, MOA, MR Worksheet, 5-Day, Post HRG)
    - Auto-dismisses after 3s with fade-in slide-in-from-top animation
    - Resolves boolean fields to checked/unchecked, null to cleared
    - Includes claimant name in message for context

[33mcommit 59a67b74b6f701a958756cc83464ae33f6586ede[m
Author: jvincec <jvincec@simple.biz>
Date:   Fri Mar 20 04:22:25 2026 +0800

    feat: global notification system + MR pivot UI fixes
    
    MR Pivot:
    - Restructure summary cards to 3-per-col layout (Total/InProgress/Ready | Complete/NotStarted/Urgent)
    - Add role-gated 4-col admin layout with No Specialist + No Task Assigned cards (system_admin, mr_admin, mr_lead only)
    - Fix card height stretching, compact number sizing to match Hearing Dashboard
    - Make round robin rotation order dynamic from DB display_order (remove all hardcoded color lists)
    - Remove local MR notification bell + polling in favor of global system
    
    Global Notifications:
    - Add src/lib/notifications.ts — shared NotificationItem type + createWithdrawalNotification helper
    - Add src/app/api/notifications/route.ts — REST endpoint polled by client context
    - Add src/context/notification-context.tsx — 30s polling, unread count, markAllRead
    - Wire NotificationProvider into DashboardShell so all pages share one bell
    - Update AppHeader bell with live unread count badge + dropdown panel (type badges, time-ago, author)
    - Limit panel to 3 visible notifications with scroll beyond
    - Trigger withdrawal notifications from Hearing Dashboard updateHearing action

[33mcommit d64598ba6947037593714f7d98f1d1281cb94197[m
Merge: c92d881 9ae5add
Author: jerup-dev <jerup@simple.biz>
Date:   Thu Mar 19 15:16:40 2026 -0400

    Merge pull request #63 from Simple-biz/codefix/sched-unlock-fix
    
    fixed admin unlock for past 45days deadline

[33mcommit 9ae5add032a8bc999663ef6a29d7156228aa3227[m[33m ([m[1;31morigin/codefix/sched-unlock-fix[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Mar 19 15:14:57 2026 -0400

    fixed admin unlock for past 45days deadline

[33mcommit 262d9d9106120b75306dece24d26c05d898f8443[m
Author: jvincec <jvincec@simple.biz>
Date:   Fri Mar 20 02:17:02 2026 +0800

    feat(mr-pivot): restructure summary cards layout with role-based visibility
    
    - Reorder stat cards to 3-per-column (Total/In Progress/Ready | Complete/Not Started/Urgent)
    - Add 4-col admin layout: stat cols + No Specialist/No Task (220px) + Team Assignments (320px)
    - Gate No Specialist and No Task Assigned cards to system_admin, mr_admin, mr_lead only
    - Stretch all columns to equal height with items-stretch and flex-1 on cards
    - Bump compact number size to text-2xl sm:text-3xl to match Hearing Dashboard

[33mcommit c92d88130ab025799f7d70a1b02843cff9069d1d[m
Merge: 18128af c7b6906
Author: jerup-dev <jerup@simple.biz>
Date:   Thu Mar 19 14:02:17 2026 -0400

    Merge pull request #60 from Simple-biz/codefix/settings-page
    
    added edit action in settings and user login logs

[33mcommit c7b6906ffd1abbd9ccd3bc79ccd7001283a08088[m[33m ([m[1;31morigin/codefix/settings-page[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Mar 19 14:00:44 2026 -0400

    added edit action in settings and user login logs

[33mcommit 97972f0ff4bca39a4d38b7a2980f70b3c7c5088b[m
Merge: 6f3ce8d 18128af
Author: jvincec <jvincec@simple.biz>
Date:   Fri Mar 20 00:05:18 2026 +0800

    Merge branch 'develop' of github.com:Simple-biz/hsl-hearing-dashboard into feature/patient-portal-page

[33mcommit 18128afe36c177305649a1781835f274730a7914[m
Merge: d45fc3f 02d9bfa
Author: jerup-dev <jerup@simple.biz>
Date:   Thu Mar 19 11:16:25 2026 -0400

    Merge pull request #58 from Simple-biz/codefix/dashboard-viewport
    
    fixed viewport and activity logs double entry

[33mcommit 02d9bfa157809cf4f68eb36f2e24b0d71318e726[m[33m ([m[1;31morigin/codefix/dashboard-viewport[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Mar 19 11:10:19 2026 -0400

    fixed viewport and activity logs double entry

[33mcommit d45fc3f96c6ab0062958f9d57d719b7825a1817d[m
Merge: 4c9a1a3 09cc664
Author: jerup-dev <jerup@simple.biz>
Date:   Wed Mar 18 15:38:35 2026 -0400

    Merge pull request #56 from Simple-biz/codefix/dashboard-viewport
    
    fixed dashboard horizontal scroll and eslint errors

[33mcommit 09cc664eef24528dd086b5c46aa59e86018662d1[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Wed Mar 18 15:35:08 2026 -0400

    fixed dashboard horizontal scroll and eslint errors

[33mcommit 6f3ce8d6e5a4a27df7bb1c8387bc0576128c9667[m
Merge: 5b4dcdb 4c9a1a3
Author: jvincec <jvincec@simple.biz>
Date:   Thu Mar 19 02:56:32 2026 +0800

    Resolve merge conflicts

[33mcommit 4c9a1a3125baafb0475454d6486b2d57c55d6b94[m
Merge: a184341 fa7162f
Author: jerup-dev <jerup@simple.biz>
Date:   Wed Mar 18 14:45:07 2026 -0400

    Merge pull request #55 from Simple-biz/feature/medical-records-page
    
    Feature/medical records page

[33mcommit fa7162fb8ccbe5522d4448011025e7d7f708efb7[m[33m ([m[1;31morigin/feature/medical-records-page[m[33m)[m
Merge: 7c17cbb 7ed9ac5
Author: jerup-dev <jerup@simple.biz>
Date:   Wed Mar 18 14:42:38 2026 -0400

    Merge pull request #29 from Simple-biz/feature/mr-rfc-page
    
    Migrate mr_rfc to nextjs and integrate into medical records page

[33mcommit 7ed9ac5e67ab51c2cce766889694942bb9d10231[m[33m ([m[1;31morigin/feature/mr-rfc-page[m[33m, [m[1;32mfeature/mr-rfc-page[m[33m)[m
Merge: 69e5d99 7c17cbb
Author: jvincec <jvincec@simple.biz>
Date:   Thu Mar 19 02:21:56 2026 +0800

    Resolve merge conflicts

[33mcommit a184341d20d7a4ddf9ea7de786825e305ca1c13e[m
Merge: 63f5104 7c17cbb
Author: jerup-dev <jerup@simple.biz>
Date:   Wed Mar 18 14:19:43 2026 -0400

    Merge pull request #26 from Simple-biz/feature/medical-records-page
    
    Migrate mr pivot page to nextjs

[33mcommit 5b4dcdbf0944e9208be0173a897ffce77064b852[m
Author: jvincec <jvincec@simple.biz>
Date:   Thu Mar 19 02:08:37 2026 +0800

    feat(patient-portal): mobile responsive layout with card view
    
    - Add PortalMobileCard component — stacked card layout for small screens
    - Desktop grid (sm+) and mobile cards (< sm) toggle via breakpoint classes
    - Search input full-width on mobile, fixed-width on desktop
    - Mobile card shows dates, specialist badge, links, credentials, status badges, notes and actions

[33mcommit 001ccb30281aa376ecc297d5bd3ce2c4889b0b06[m
Author: jvincec <jvincec@simple.biz>
Date:   Thu Mar 19 01:09:47 2026 +0800

    Code cleanup and linter correction

[33mcommit b174945311e18694ed10bdbdb6c1adccb2f5b851[m
Author: jvincec <jvincec@simple.biz>
Date:   Thu Mar 19 00:54:00 2026 +0800

    fix(patient-portal): layout, alignment, date formatting, and stat refresh
    
    - Convert PortalRow from table/tr/td to CSS grid div matching header constants
    - Fix PORTAL_GRID/PORTAL_MIN_W shared between header and rows for true column alignment
    - Fix Invalid Date by slicing date string to YYYY-MM-DD before parsing
    - Cast entry_date and hearing_date to ::text in SELECT query
    - Add getPortalStats action and refreshStats helper for accurate stat cards
    - Refresh stats after add, edit, delete, inline field update, and link save
    - Fix activity log always showing empty (removed user_id != 1 filter)
    - Fix getPortalActivityUsers same filter removal
    - Restore missing function PortalRow declaration lost during refactor

[33mcommit 63f5104db015bd10f26c3cb269ba3cd2004df700[m
Merge: f82d43a 6daeacf
Author: jerup-dev <jerup@simple.biz>
Date:   Wed Mar 18 11:49:55 2026 -0400

    Merge pull request #53 from Simple-biz/codefix/import-xlsx
    
    Codefix/import xlsx

[33mcommit 1ed2432ef1373f7c38f4c51bb66ec6348d1e3e35[m
Author: jvincec <jvincec@simple.biz>
Date:   Wed Mar 18 23:09:52 2026 +0800

    fix: field name corrections, post hrg notes, and patient portal wiring
    
    - Fix stale Hearing field names across medical-records-client, hearings-modal (manner_of_appearance, five_day_notice, post_hrg_review, medical_record_link)
    - Fix updateMoa and updateWorksheetLink writing to wrong DB column names
    - Rewrite getPostHrgNotes to read JSON from hearings.post_hrg_notes TEXT column
    - Add addPostHrgNote action and wire textarea input in post-hrg-modal
    - Fix setState-in-effect lint error in NotesList with useTransition
    - Add Patient Portal and RFC Documents buttons to medical-records header bar
    - Fix patient-portal/page.tsx requireAuth import (lib/auth → lib/session)
    - Wire patient portal server actions to Neon DB replacing all stubs

[33mcommit cba23980c373eb36e5a20ac3063f3dfef4e947f0[m
Merge: bbd0322 7c17cbb
Author: jvincec <jvincec@simple.biz>
Date:   Wed Mar 18 21:44:37 2026 +0800

    Merge branch 'feature/medical-records-page' of github.com:Simple-biz/hsl-hearing-dashboard into feature/patient-portal-page

[33mcommit bbd0322c3f05d2b4febd99e57ade641da54196fc[m
Author: jvincec <jvincec@simple.biz>
Date:   Wed Mar 18 21:41:45 2026 +0800

    Fix requireAuth import path (lib/auth → lib/session)

[33mcommit 7c17cbb52853a35cb60f9d124601bcd7a7f11a6c[m[33m ([m[1;32mfeature/medical-records-page[m[33m)[m
Author: jvincec <jvincec@simple.biz>
Date:   Wed Mar 18 21:35:07 2026 +0800

    refactor(hearings): sync modal field names with database schema
    
    Update manner_of_hearing to manner_of_appearance.
    
    Rename five_day_letter to five_day_notice.
    
    Update post_hrg_status to post_hrg_review.
    
    Map mr_worksheet_link to medical_record_link for persistence.

[33mcommit 01b9f04b1b1c4b3f882fe8b190ce947bdbbfc41a[m
Merge: d184501 4aab227
Author: jvincec <jvincec@simple.biz>
Date:   Wed Mar 18 21:24:09 2026 +0800

    Merge branch 'feature/medical-records-page' of github.com:Simple-biz/hsl-hearing-dashboard into feature/patient-portal-page

[33mcommit 4aab22778bfa04c84096e15f03d4b8e5cd2e9154[m
Author: jvincec <jvincec@simple.biz>
Date:   Wed Mar 18 21:06:28 2026 +0800

    fix(medical-records): correct column names and wire post hrg notes storage
    
    - Fix updateMoa writing to manner_of_hearing → manner_of_appearance
    - Fix updateWorksheetLink writing to mr_worksheet_link → medical_record_link
    - Rewrite getPostHrgNotes to read JSON array from hearings.post_hrg_notes TEXT column
    - Add addPostHrgNote action — prepends note to JSON array, sets post_hrg_review = true
    - Wire addPostHrgNote into NotesList with textarea input and Add Note button
    - Fix setState-in-effect lint error in NotesList — replaced with useTransition

[33mcommit 6daeacf2fb4b235c2335a7a205ccb96bcb98ffd6[m[33m ([m[1;31morigin/codefix/import-xlsx[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Mar 17 16:52:31 2026 -0400

    updated import-xlsx and fixed timezone error

[33mcommit 29b5c9a99b039921dfdaa937298e93fc51134265[m
Author: jvincec <jvincec@simple.biz>
Date:   Wed Mar 18 04:44:51 2026 +0800

    fix(medical-records): column alignment, field name corrections, modal wiring
    
    - Fix 4 mismatched Hearing interface field names (manner_of_appearance, five_day_notice, post_hrg_review, medical_record_link)
    - Enforce PHP column order and add gap-x-2 spacing; header color changed to bg-muted
    - Group header badges now show Complete ✓ and In Progress ⏳ counts
    - 5-Day renders as real checkbox; hearing date cell centered
    - Per-row Post HRG button opens PostHrgModal with hearingId; add WorksheetLinkModal for MR link editing
    - PostHrgModal accepts optional hearingId prop to auto-select hearing on open

[33mcommit 81bae5d62a428e9eb67a53da0e14f81a7e7eccf4[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Mar 17 09:24:07 2026 -0400

    updated xlsx export workflow

[33mcommit d184501c725252e3b0a05ed61cba4a5cc25bbd27[m
Merge: 10cc411 47a8d6e
Author: jvincec <jvincec@simple.biz>
Date:   Tue Mar 17 21:16:40 2026 +0800

    Resolve merge conflicts

[33mcommit 47a8d6e90e312c97c0e5b2a040ab4421450c344d[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Mar 17 05:07:44 2026 +0800

    fix(mr-pivot): address PR feedback — selects, toggles, pagination, round robin
    
    - Fix ESLint ternary side effects: extract toggleSetKey utility, use in all 3 toggles
    - Add MR_STATUS_TEXT/HRG_STATUS_TEXT text-only maps for select styling
    - Selects use bg-card always, border-current + text color when value selected
    - Placeholder state uses neutral text, transparent border, hover:border-border
    - Add text-foreground bg-card to all select option elements
    - Fix mr_team optimistic update: correctly maps mr_team_id/name/color in state
    - Fix real-time round robin: call getRoundRobinState() immediately after mr_team update
    - Add Pink Team to rotation order and all team_color IN clauses (position 6)
    - Add page jump select dropdown to pagination controls
    - Auto-expand matching months when search returns results
    - Add date + team filters to TeamStatsModal with clear button
    - Update getTeamStats action to accept dateFrom/dateTo/teamId filter params

[33mcommit b7807caea59930c6ef6ef2d26914a1690497aac8[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Mar 17 03:39:58 2026 +0800

    fix(mr-pivot): PR feedback — alignment, activity log, viewport rendering
    
    - Widen Credited column header from 36px to 56px to fix overflow into Status
    - Left-align Date column header to match row cell alignment
    - Add TanStack Virtual overscan:15 + scroll skeleton loading indicator
    - Wire ActivityLogModal with initialCategory='mr' and MR title from MR Pivot
    - Add MR Records category tab to ActivityLogModal with MR action color badges
    - Add 'mr' catMap entry to fetchActivityLog covering all 10 MR action types
    - Wire createWithdrawalNotification into dashboard updateHearing for decision status
    - Fix 500/page divide-by-zero with Math.max(1,...) guard on perPage

[33mcommit 69e5d99b93c1f3aa53880a1fff120fe8a67ae14c[m
Author: jvincec <jvincec@simple.biz>
Date:   Mon Mar 16 23:56:02 2026 +0800

    fix setState issue in rfc-client

[33mcommit 94b0c5600d9fb39e85209d76cb60c449de63e61a[m
Merge: 71398fe b013650
Author: jvincec <jvincec@simple.biz>
Date:   Mon Mar 16 23:53:55 2026 +0800

    Merge branch 'feature/medical-records-page' of github.com:Simple-biz/hsl-hearing-dashboard into feature/mr-rfc-page

[33mcommit b0136505465b4d2230ba51d98b0277e35970ca9d[m[33m ([m[1;31morigin/feature/rfc-page[m[33m, [m[1;32mfeature/rfc-page[m[33m)[m
Merge: 543e15c f82d43a
Author: jvincec <jvincec@simple.biz>
Date:   Mon Mar 16 23:47:16 2026 +0800

    Merge branch 'develop' of github.com:Simple-biz/hsl-hearing-dashboard into feature/medical-records-page

[33mcommit 71398fe9cb8b54a3442358bab3a4348bf8e0cab3[m
Author: jvincec <jvincec@simple.biz>
Date:   Mon Mar 16 23:46:13 2026 +0800

    feat(rfc): mobile responsive layout + fix cascading setState in effect
    
    - Add RfcMobileCard component replacing table rows on small screens
    - Hide desktop table on mobile (md:hidden / hidden md:flex breakpoints)
    - Rewrite filter bar to full-width search + 2-col grid on mobile
    - Stack card header title and action buttons vertically on mobile
    - Shorten toolbar button labels on small screens via hidden sm:inline
    - Fix synchronous setState in RfcActivityLogModal useEffect

[33mcommit c682cf0ccf91cca67db52bc4999171cec6ca4564[m
Author: jvincec <jvincec@simple.biz>
Date:   Mon Mar 16 22:50:59 2026 +0800

    fix(mr-pivot): add activity logging to mutations, guard Phase 4 tables
    
    - Add logActivity() helper using getSession() to match PHP logActivity()
    - Wire activity_log calls to all 7 mutations (mr_status, mr_team, moa, etc.)
    - Wrap getPostHrgNotes and getNotifications in try/catch (Phase 4 tables)
    - Fix getServerSession → getSession in rfc/action.ts to match session export

[33mcommit f55b462ef740b3d552df76e8434782d4f8bfa6ad[m
Author: jvincec <jvincec@simple.biz>
Date:   Mon Mar 16 21:44:48 2026 +0800

    feat(rfc): implement database integration and granular permission model
    
    Replace server stubs with parameterized SQL queries and parallelized data fetching.
    
    Expand permission architecture to support granular CRUD and export controls.
    
    Apply route guards and connect RFC navigation to the Medical Records toolbar.

[33mcommit 85ee48e8f60901e405c3ff26c3c0fc6bef143065[m
Merge: 429b35e 543e15c
Author: jvincec <jvincec@simple.biz>
Date:   Mon Mar 16 21:08:35 2026 +0800

    Resolve merge conflicts

[33mcommit f82d43a73f99a7dd89f6e23337b16d30431a0630[m
Merge: e527f04 51165b2
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Mar 13 16:48:30 2026 -0400

    Merge pull request #42 from Simple-biz/codefix/dashboard-usestate-fix
    
    updated role views edit access and usestate errors

[33mcommit 51165b2c59c64d10c7f7d9e4785b385893271bc9[m[33m ([m[1;31morigin/codefix/dashboard-usestate-fix[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Mar 13 16:46:19 2026 -0400

    updated role views edit access and usestate errors

[33mcommit 543e15caa4842e05fa1030bdee766167af3f758c[m
Author: jvincec <jvincec@simple.biz>
Date:   Sat Mar 14 04:19:38 2026 +0800

    feat(mr-pivot): wire real DB queries, update roles & route protection
    
    - Replace all stub data in action.ts with real Neon Postgres queries
    - Run all page-load queries in parallel via Promise.all (latency fix)
    - Expand UserRole union in types.ts to match canonical roles.ts
    - Update derivePermissions to reflect PDF Part 2.2 MR Pivot field rules
    - Add server-side route guard in page.tsx using PAGE_ACCESS.medical_records

[33mcommit 03bd2e488f49420fc18fe6535878619eaac1d74d[m
Merge: 565e28d e527f04
Author: jvincec <jvincec@simple.biz>
Date:   Sat Mar 14 03:31:42 2026 +0800

    Merge branch 'develop' of github.com:Simple-biz/hsl-hearing-dashboard into feature/medical-records-page

[33mcommit 565e28db3e4ffb950af98b107135e58e49861d8f[m
Author: jvincec <jvincec@simple.biz>
Date:   Sat Mar 14 03:30:47 2026 +0800

    fix(mr-pivot): restore 1-to-1 layout with PHP app
    
    - Fix root cause: add w-full to page container so it fills flex parent
    - Restructure summary section to single [1fr_300px] grid matching PHP
    - Redesign AssignmentCard with colored header band + body w/ year/month selects
    - Move RoundRobin inline into filter bar; stat cards use PHP gradient colors

[33mcommit e527f043fb1be829efe04ab7ea10eb315e44299b[m
Merge: db6e194 a71e458
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Mar 13 14:23:35 2026 -0400

    Merge pull request #41 from Simple-biz/feature/tanstack-implementation
    
    tanstack implementation and updated role access

[33mcommit a71e45867e57e5426414b81022764e8c6bb0be8c[m[33m ([m[1;31morigin/feature/tanstack-implementation[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Mar 13 14:21:19 2026 -0400

    tanstack implementation and updated role access

[33mcommit db6e194114ca81a1d6f470c0f496a7d02ad921c2[m
Merge: 85999e3 c8de08b
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Mar 13 11:55:09 2026 -0400

    Merge pull request #39 from Simple-biz/codefix/dashboard-actions-latency
    
    fixed latency and updated layout for darkmode

[33mcommit c8de08b400ebdcf8327ce141b7bd9289f83a25ff[m[33m ([m[1;31morigin/codefix/dashboard-actions-latency[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Mar 13 11:51:07 2026 -0400

    fixed latency and updated layout for darkmode

[33mcommit 63401a9d073ada4a5ca8e330b8fa80d13a80bb39[m
Merge: 48b555a 85999e3
Author: jvincec <jvincec@simple.biz>
Date:   Fri Mar 13 04:58:17 2026 +0800

    Merge branch 'develop' of github.com:Simple-biz/hsl-hearing-dashboard into feature/medical-records-page

[33mcommit 85999e3138bb7d0cf6a0c1a24071214683bdd7aa[m
Merge: c6048ff 5cab420
Author: jerup-dev <jerup@simple.biz>
Date:   Thu Mar 12 16:51:09 2026 -0400

    Merge pull request #25 from Simple-biz/feature/reports-page-fixes
    
    Implement and integrate report detail modals

[33mcommit 5cab420ef9c6d660ac4cc0556a8a4e7f8ec13cef[m[33m ([m[1;31morigin/feature/reports-page-fixes[m[33m, [m[1;32mfeature/reports-page-fixes[m[33m)[m
Author: jvincec <jvincec@simple.biz>
Date:   Fri Mar 13 04:41:44 2026 +0800

    Add dashboard navigation to reports page

[33mcommit 1ad73c817bdc0a44ae3704c0991100e13e1269d8[m
Author: jvincec <jvincec@simple.biz>
Date:   Fri Mar 13 04:02:42 2026 +0800

    Remove unused variables, dropped unused parameter assignments and removed disclaimer banner

[33mcommit c6048ff147a3784e896b0c007067a42e2b5f185f[m
Merge: b831321 7b32bec
Author: jerup-dev <jerup@simple.biz>
Date:   Thu Mar 12 15:59:38 2026 -0400

    Merge pull request #35 from Simple-biz/codefix/bulk-actions-payload-limit
    
    updated login page

[33mcommit 7b32bec098f9785a5509308428201c363107d922[m[33m ([m[1;31morigin/codefix/bulk-actions-payload-limit[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Mar 12 15:58:11 2026 -0400

    updated login page

[33mcommit c8b7dcbd89dc925f6fc286dec131deb99f5f1430[m
Author: jvincec <jvincec@simple.biz>
Date:   Fri Mar 13 03:29:25 2026 +0800

    Code cleanup and remove console messages

[33mcommit b8313217a9523648f278d0d111798d2614927ff2[m
Merge: 5c3df92 685090b
Author: jerup-dev <jerup@simple.biz>
Date:   Thu Mar 12 15:11:30 2026 -0400

    Merge pull request #33 from Simple-biz/codefix/bulk-actions-payload-limit
    
    fixed page render and payload limit

[33mcommit 685090be8519d818c7563814508e6078a4c2d8bf[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Mar 12 15:04:22 2026 -0400

    fixed page render and payload limit

[33mcommit e30cb73bd3adc0c30e8f8d4bd46bb7c81e369e3b[m
Author: jvincec <jvincec@simple.biz>
Date:   Fri Mar 13 03:03:10 2026 +0800

    feat(reports): mobile responsive layout for reports page and all modals
    
    - Filter bar stacks vertically on mobile (flex-col sm:flex-row); selects
      full-width; Apply Filters stretches to fill row on small screens
    - Stat cards 2-col mobile → 4-col tablet → 8-col desktop; numbers scale down
    - ModalShell: edge padding, taller max-h on mobile, header actions wrap
    - All 4 modal tables wrapped in overflow-x-auto with min-w to prevent crush

[33mcommit 0a0b6b74954aae9623ceeabd9caf3e14c26aa149[m
Author: jvincec <jvincec@simple.biz>
Date:   Fri Mar 13 02:16:40 2026 +0800

    feat(reports): UI polish — shadcn Select filters, colored buttons, withdrawal row, table borders
    
    Filter bar:
    - Replace raw <select> elements with shadcn Select components (matching
      rep dashboard pattern); h-9 height, SelectTrigger/Content/Item
    - Remove ChevronDown import (shadcn Select handles its own chevron)
    - Apply Filters button: bg-blue-600 (was bg-primary/flat)
    - Reset button: bg-zinc-200 text-zinc-700 (visible but neutral)
    
    Card action buttons (reports.tsx):
    - GhostBtn upgraded with color prop (blue | emerald | purple | amber)
    - View Details buttons: blue; Export buttons: emerald; Status panel: purple
    - All buttons now solid colored with white text — consistent with rep dashboard
    
    Modal action buttons (all 4 modals):
    - Expand All: bg-blue-600 (was border/ghost)
    - Collapse All: bg-zinc-200 (was border/ghost)
    - Export CSV: bg-emerald-600 (was bg-primary)
    
    Assigned cases modal:
    - max-w-xl → max-w-2xl; month names no longer wrap
    - border-separate → border-collapse with border border-border on all
      th/td for grid-like table appearance matching PHP version
    - Add withdrawal row: wired withdrawalTotal through action.ts →
      ReportsData → reports.tsx → modal; WITHDRAWAL always renders last,
      styled with rose tint on row/badge/count for visual distinction
    - MonthCodeBadge accepts withdrawal prop for rose variant styling
    - Estimated month breakdown derived proportionally for withdrawal row

[33mcommit 1f45ba69dfcce784f76db2f29c4cb719c1f718f7[m
Author: jvincec <jvincec@simple.biz>
Date:   Fri Mar 13 00:29:09 2026 +0800

    fix(reports): address all PR review blockers, required changes, and suggestions
    
    Blockers:
    - [1.1] Remove setState-in-useEffect anti-pattern; use key remount on
      ReportAssignedCasesModal and ReportMatrixModal instead (assigned-open/
      closed, matrix-open/closed) to reset state naturally on open/close
    - [1.2] Wire all 5 fetch functions to live Neon Postgres via db.query():
      fetchAllMonthly, fetchAllHearingStatuses, fetchAllAssignedReps,
      fetchAllRepStatusRows, fetchStatCards — mock data removed; quickSelect
      and rep filters pushed to SQL WHERE clauses; rep resolved to ID once
      and reused across all queries
    
    Required changes:
    - [2.1] Lazy-load chart.js and chartjs-plugin-datalabels inside useEffect
      via dynamic import(); removes ~200KB from initial bundle
    - [2.2] Extract useBodyScrollLock shared hook; all 4 report modals use it
      via ModalShell — inline document.body.style.overflow blocks removed
    - [2.3] Rename StatCard interface to StatCardData to avoid collision with
      StatCard UI component; update ReportsData and computeWinRate accordingly
    - [2.4] Create ModalShell shared wrapper matching settings/admin pattern
      (backdrop-blur, animate-in, Separator, SVG X button); all 4 report
      modals refactored to use it; blue header bars removed
    
    Suggestions:
    - [3.2] Auto-apply filters on select change with 400ms debounce via
      updatePending; Apply/Reset buttons remain as manual override
    - [3.3] Add responsive breakpoints to three-panel chart grid:
      grid-cols-1 lg:grid-cols-3
    - [3.4] Mark month-level drill-down in assigned cases modal as estimated;
      add amber warning banner and Est. badge on each month row
    
    Bug fixes:
    - Fix duplicate React key warning — modal siblings all used key='closed';
      prefixed with modal name (assigned-closed, matrix-closed)
    - Constrain status distribution card content to h-64 to align with other
      panel cards; make legend list scrollable with max-h-56 overflow-y-auto
    - Add pr-2 padding and truncate max-w-[130px] on legend labels to prevent
      count values from sitting flush against scrollbar; long names ellipsised
      with full name exposed via title tooltip

[33mcommit 5c3df92cb04e6573b939636f5816d5141dcfb43e[m
Merge: ad267f5 08712fe
Author: jerup-dev <jerup@simple.biz>
Date:   Wed Mar 11 16:28:48 2026 -0400

    Merge pull request #31 from Simple-biz/feature/dashboard-bulk-actions
    
    added dashboard bulk actions

[33mcommit 08712fe31820b5117694da8d1a8094ba8274df26[m[33m ([m[1;31morigin/feature/dashboard-bulk-actions[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Wed Mar 11 16:26:17 2026 -0400

    added dashboard bulk actions

[33mcommit 10cc411fa57ef51e7fb6b4a135bb6b4045e7f539[m
Author: jvincec <jvincec@simple.biz>
Date:   Thu Mar 12 04:03:51 2026 +0800

    fix(react): resolve anti-patterns and synchronous state warnings
    
    Replace synchronous setState in useEffect with useTransition for modal loading.
    
    Extract DetailRow component to module level to prevent unnecessary remounts.
    
    Use key prop pattern in LinkModal to handle state reset instead of useEffect.

[33mcommit 2deeb9ab29ce83a469781c164f61c4259d4f32a2[m
Author: jvincec <jvincec@simple.biz>
Date:   Thu Mar 12 02:56:53 2026 +0800

    Migrate and integrate patient portal page in medical records page

[33mcommit 429b35ea9d7009abfd5af36aac87b896bb3c71c4[m
Author: jvincec <jvincec@simple.biz>
Date:   Thu Mar 12 02:12:44 2026 +0800

    Migrate mr_rfc to nextjs and integrate into medical records page

[33mcommit c5106165b486d23466ae2025ee84d497ed7c1eec[m
Author: jvincec <jvincec@simple.biz>
Date:   Thu Mar 12 01:57:49 2026 +0800

    Remove extra whitespaces in variable declarations and data assignments

[33mcommit 48b555ae40845417228b718d69716d5b3317c334[m
Author: jvincec <jvincec@simple.biz>
Date:   Thu Mar 12 01:21:20 2026 +0800

    feat(medical-records): implement filtering logic and refactor CSV exports
    
    Update getHearingsPaginated stub to apply search, team, and status filters.
    
    Centralize CSV export logic into top-level utilities and remove inline duplicates.
    
    Wire toolbar export buttons to handle properly quoted CSV downloads.

[33mcommit 4a48ed9dee6ee44e2a842774f0095ee534b59839[m
Author: jvincec <jvincec@simple.biz>
Date:   Thu Mar 12 00:52:45 2026 +0800

    style(dashboard): polish card design and layout structure
    
    Add decorative circle overlays to Summary/Assignment cards and apply colored themes.
    
    Restructure grid layout for improved component grouping and standardize modal props.

[33mcommit 32736fe7b0f85cadd9f76094f4e3241b7d74c12a[m
Author: jvincec <jvincec@simple.biz>
Date:   Thu Mar 12 00:23:51 2026 +0800

    fix(build): resolve "use server" sync export and layout crash
    
    Move sync helpers and types to types.ts to satisfy Turbopack constraints.
    
    Re-export types from action.ts to maintain backward compatibility.

[33mcommit 09c5d9f9656ba0ff45f0180233428cf4ffb48554[m
Merge: 17de5a4 ad267f5
Author: jvincec <jvincec@simple.biz>
Date:   Wed Mar 11 21:57:43 2026 +0800

    Merge branch 'develop' of github.com:Simple-biz/hsl-hearing-dashboard into feature/reports-page-fixes

[33mcommit 7bd15ed4990aa70d436a1f7d4f420888349220cb[m
Merge: 7ad14b8 ad267f5
Author: jvincec <jvincec@simple.biz>
Date:   Wed Mar 11 21:54:49 2026 +0800

    Merge branch 'develop' of github.com:Simple-biz/hsl-hearing-dashboard into feature/medical-records-page

[33mcommit ad267f5285c759b04fa7866f0b1b7688c6f8bf2b[m
Merge: 45066f0 d1ab1e1
Author: jerup-dev <jerup@simple.biz>
Date:   Wed Mar 11 09:45:16 2026 -0400

    Merge pull request #27 from Simple-biz/feature/import-csv
    
    added import csv v1 and fixed the missing sidebar

[33mcommit d1ab1e14dbc22c2d2c86071d5ed896831b9258a6[m[33m ([m[1;31morigin/feature/import-csv[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Wed Mar 11 09:44:12 2026 -0400

    added import csv v1 and fixed the missing sidebar

[33mcommit 7ad14b8ed65f16a8998e3d7799697676e2842fcf[m
Author: jvincec <jvincec@simple.biz>
Date:   Wed Mar 11 21:16:54 2026 +0800

    Migrate mr pivot page to nextjs

[33mcommit 17de5a4d805195d632d935b7120b19c02e71cae6[m
Author: jvincec <jvincec@simple.biz>
Date:   Wed Mar 11 04:36:20 2026 +0800

    fix(ui): prevent button wrapping in modal header
    
    Remove flex-wrap and format action interface import
    
    Ensures all header actions stay on a single row within the max-w-xl modal.

[33mcommit f672ee395dacfcd456a03cd0816086341b954465[m
Author: jvincec <jvincec@simple.biz>
Date:   Wed Mar 11 04:10:34 2026 +0800

    refactor(reports): derive rep-monthly data client-side in modal
    
    Update assigned-cases-modal to synthesize monthly rows from existing props.

[33mcommit cf4490e452d301c873eea0524a4bec5b3f0768a2[m
Author: jvincec <jvincec@simple.biz>
Date:   Wed Mar 11 03:53:33 2026 +0800

    feat(reports): implement and integrate report detail modals
    
    Add 4 Tailwind-based modals with CSV export, sticky headers, and scroll locking.
    
    Wire dashboard GhostBtn interactions with live search and sortable column logic.

[33mcommit 45066f0a3ab5fab8b75ed9dc730e0a3dbe9f27da[m
Merge: ae094f8 6925389
Author: jerup-dev <jerup@simple.biz>
Date:   Tue Mar 10 13:45:01 2026 -0400

    Merge pull request #23 from Simple-biz/feature/stat-card
    
    added statcard component

[33mcommit 69253896ef864ac3891f39717611983081adcfb9[m[33m ([m[1;31morigin/feature/stat-card[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Mar 10 13:44:09 2026 -0400

    added statcard component

[33mcommit ae094f840c1e59260e0c78e862d6c801795d56fe[m
Merge: 44a1c54 510f8e3
Author: jerup-dev <jerup@simple.biz>
Date:   Tue Mar 10 13:18:27 2026 -0400

    Merge pull request #19 from Simple-biz/feature/reports-page
    
    Migrated pivot page to reports page and applied Ui enhancements

[33mcommit 510f8e3a5e9d2712f7eabd172a44562515184bfb[m[33m ([m[1;31morigin/feature/reports-page[m[33m, [m[1;32mfeature/reports-page[m[33m)[m
Merge: 266a5d8 44a1c54
Author: jvincec <jvincec@simple.biz>
Date:   Wed Mar 11 01:15:12 2026 +0800

    Resolve merge conflicts

[33mcommit 44a1c5486ec627677d331a6254501914c33fb78b[m
Merge: 164ac18 9cf410c
Author: jerup-dev <jerup@simple.biz>
Date:   Tue Mar 10 13:00:04 2026 -0400

    Merge pull request #20 from Simple-biz/feature/change-password-form
    
    Feature/change password form

[33mcommit 266a5d8c588531cc63f2e505e9b981917126f789[m
Author: jvincec <jvincec@simple.biz>
Date:   Wed Mar 11 00:58:59 2026 +0800

    refactor(reports): implement dynamic filtering and loading feedback
    
    - Add button handlers with useTransition for smooth data updates and loading states
    
    - Replace hardcoded UI values with server-derived months, reps, and dynamic win rates
    
    - Improve UX with empty-state guards, typed props, and a functional CSV export utility

[33mcommit 9cf410c482f889754af7025be67428bea60f93ce[m[33m ([m[1;31morigin/feature/change-password-form[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Mar 10 12:58:42 2026 -0400

    added change password page

[33mcommit 4ba9b5233c376c8be8c362a7da64ed0d61c78cf7[m
Author: jvincec <jvincec@simple.biz>
Date:   Wed Mar 11 00:37:03 2026 +0800

    refactor(reports): improve chart type safety and align stat card styling
    
    - Add HTMLCanvasElement and Chart typing to refs
    - Implement null-guard checks for Chart.js
    - Update stat card styling for consistency

[33mcommit 18623f85ef5ef23ad96bc12e84e2c968df994929[m
Merge: 6b150c1 164ac18
Author: jvincec <jvincec@simple.biz>
Date:   Tue Mar 10 22:51:11 2026 +0800

    Merge branch 'develop' of github.com:Simple-biz/hsl-hearing-dashboard into feature/reports-page

[33mcommit 6b150c1568434a1a3439ee78687b24e6d86a1344[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Mar 10 22:46:22 2026 +0800

    Refactor folder structure and CRUD ops for reports page

[33mcommit 8c0dcc3b3505f36ca17d7ebb07c8c89a7be64f78[m
Merge: 7f69604 164ac18
Author: jerup-dev <jerup@simple.biz>
Date:   Tue Mar 10 10:40:02 2026 -0400

    Merge pull request #18 from Simple-biz/develop
    
    Develop

[33mcommit 164ac186af45cbbf3a0e3129637731f51322c720[m
Merge: 0a34dc3 4fde9d0
Author: jerup-dev <jerup@simple.biz>
Date:   Tue Mar 10 10:39:35 2026 -0400

    Merge pull request #17 from Simple-biz/feature/admin-page
    
    added admin-page

[33mcommit 4fde9d07f01e73598d1fa79b2c7ccb69f9e6577d[m[33m ([m[1;31morigin/feature/admin-page[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Mar 10 10:37:43 2026 -0400

    added admin-page

[33mcommit 6338c9a013bf71c454d51f202361ab0fb3b7c715[m
Author: jvincec <jvincec@simple.biz>
Date:   Tue Mar 10 04:44:55 2026 +0800

    Migrated pivot page to reports page and applied Ui enhancements

[33mcommit 7f69604f740cc9c8e3cf366e72279bcd66834ea7[m
Merge: f3d1c8f 0a34dc3
Author: jerup-dev <jerup@simple.biz>
Date:   Mon Mar 9 13:04:32 2026 -0400

    Merge pull request #15 from Simple-biz/develop
    
    fixed horizontal scroll

[33mcommit 0a34dc3ae41ac0df46b1ea676088f8c2c03fb321[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Mon Mar 9 13:01:55 2026 -0400

    fixed horizontal scroll

[33mcommit f3d1c8f92315102b3d3266bbc45e019c34e0c114[m
Merge: a6f64a5 7827e5f
Author: jerup-dev <jerup@simple.biz>
Date:   Mon Mar 9 12:09:25 2026 -0400

    Merge pull request #14 from Simple-biz/develop
    
    Develop

[33mcommit 7827e5fb21ec12002addc5e24bf44e480327aa5a[m
Merge: ba49a40 fe4f668
Author: jerup-dev <jerup@simple.biz>
Date:   Mon Mar 9 12:08:29 2026 -0400

    Merge pull request #13 from Simple-biz/feature/rep-stats
    
    rep stats added

[33mcommit fe4f668ba33e81915556f10d424b278fb4180aef[m[33m ([m[1;31morigin/feature/rep-stats[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Mon Mar 9 11:56:25 2026 -0400

    rep stats added

[33mcommit a6f64a57292b4ce7ccaee8ad8c30a3dbaa055a20[m
Merge: d246c98 ba49a40
Author: jerup-dev <jerup@simple.biz>
Date:   Mon Mar 9 09:50:28 2026 -0400

    Merge pull request #12 from Simple-biz/develop
    
    Develop

[33mcommit ba49a40703c24309ca731db5d9063f1c53b48844[m
Merge: a5a7f56 00f0115
Author: jerup-dev <jerup@simple.biz>
Date:   Mon Mar 9 09:49:58 2026 -0400

    Merge pull request #11 from Simple-biz/feature/server-side-pagination
    
    added server side pagination and udpate horizontal scroll

[33mcommit 00f011512a75f6ad28214b02f77d8409e3b25fe5[m[33m ([m[1;31morigin/feature/server-side-pagination[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Mon Mar 9 09:48:59 2026 -0400

    added server side pagination and udpate horizontal scroll

[33mcommit d246c982122f11604f9b667c30125786cb5d7e13[m
Merge: 4420bff a5a7f56
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Mar 6 16:51:43 2026 -0500

    Merge pull request #10 from Simple-biz/develop
    
    Develop

[33mcommit a5a7f5628cc271d95236bf41acbae4122481bec0[m
Merge: df77dab f06b22b
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Mar 6 16:51:06 2026 -0500

    Merge pull request #9 from Simple-biz/feature/dashboard-crud
    
    updated unassign modal date

[33mcommit f06b22b76db8fd6e365056498260d31200244d83[m[33m ([m[1;31morigin/feature/dashboard-crud[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Mar 6 16:49:30 2026 -0500

    updated unassign modal date

[33mcommit 4420bffb6dfedf1621a5addc3eb1c3a7f2b9d539[m
Merge: cd1c563 df77dab
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Mar 6 16:41:39 2026 -0500

    Merge pull request #8 from Simple-biz/develop
    
    Develop

[33mcommit df77dabcf7010f3daf06f4e725ea95b28f415650[m
Merge: c4b18f9 7262983
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Mar 6 16:40:44 2026 -0500

    Merge pull request #7 from Simple-biz/feature/dashboard-crud
    
    added crud functionalities in the dashboard

[33mcommit 726298387f748003b04c860a905f1eadf8028094[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Mar 6 16:39:48 2026 -0500

    added crud functionalities in the dashboard

[33mcommit cd1c5631b48766991caa7d823ee35a55f1aa9f2f[m
Merge: bebb6e4 c4b18f9
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Mar 6 12:14:22 2026 -0500

    Merge pull request #6 from Simple-biz/develop
    
    Develop

[33mcommit c4b18f9695dd0057b2ddb6961bcf24a41332b15e[m
Merge: 368228b 19353ce
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Mar 6 12:13:52 2026 -0500

    Merge pull request #5 from Simple-biz/feature/rep-schedule
    
    rep schedule and rep dashboard page added

[33mcommit bebb6e4ede7785981c4dce2e5cab3e6bf2cc629b[m
Merge: b946b48 368228b
Author: jerup-dev <jerup@simple.biz>
Date:   Fri Mar 6 12:12:25 2026 -0500

    Merge pull request #4 from Simple-biz/develop
    
    Develop

[33mcommit 19353cecc8cd70bf10c1165ecea3603d670480f8[m[33m ([m[1;31morigin/feature/rep-schedule[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Fri Mar 6 12:11:22 2026 -0500

    rep schedule and rep dashboard page added

[33mcommit 368228bd77782e62bab8193243323cb773aea892[m
Merge: 228f279 b88e034
Author: jerup-dev <jerup@simple.biz>
Date:   Thu Mar 5 15:41:19 2026 -0500

    Merge pull request #3 from Simple-biz/feature/cron-jobs
    
    Feature/cron jobs

[33mcommit b88e034aaedbb59da74454906f0c121b4f3672f8[m[33m ([m[1;31morigin/feature/cron-jobs[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Mar 5 15:39:49 2026 -0500

    added cron jobs

[33mcommit b946b482d16e55eb5209aa6b1e81c0edaa857f3a[m
Merge: 8c03793 228f279
Author: jerup-dev <jerup@simple.biz>
Date:   Thu Mar 5 12:56:09 2026 -0500

    Merge pull request #2 from Simple-biz/develop
    
    Develop

[33mcommit 228f279a71e59dfefef088e8f8f9281d5c30a178[m
Merge: 8c03793 0fe3219
Author: jerup-dev <jerup@simple.biz>
Date:   Thu Mar 5 12:55:37 2026 -0500

    Merge pull request #1 from Simple-biz/feature/dashboard-action-modals
    
    nav action buttons updated

[33mcommit 0fe3219c6f267886c40841df5767f696ba7b0e06[m[33m ([m[1;31morigin/feature/dashboard-action-modals[m[33m)[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Mar 5 12:54:13 2026 -0500

    nav action buttons updated

[33mcommit 8c03793eae5130c2fb39b8efbbccd1a8df06e5c8[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Thu Mar 5 08:54:52 2026 -0500

    Initial commit

[33mcommit 4560ccae23d0667a29f3b2f85e1ebbaded873274[m
Author: Jeru Palma <jerunebursiapnopalma25@gmail.com>
Date:   Tue Mar 3 17:25:19 2026 -0500

    Initial commit from Create Next App
