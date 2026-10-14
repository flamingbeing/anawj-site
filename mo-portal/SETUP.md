# Setting up the Baby MO portal's shared storage

Until you do this, the portal runs in local-only mode (everything stays in the browser it was typed in). These steps
create the Firebase project that holds the questions, the MOs' logins and their results. Allow about 20 minutes.
Do them once, signed in to Google as the account that should own the project.

## A. Create the project

1. Go to https://console.firebase.google.com and click **Create a project**.
2. Name it `ntf-mo-portal` (if Firebase says the id is taken, accept the id it suggests and tell Claude). Click Continue.
3. Turn **Google Analytics off**. Click **Create project**, then Continue.

## B. Turn on the two sign-in methods

1. In the left menu choose **Build > Authentication**, then **Get started**.
2. On the **Sign-in method** tab click **Google**. Switch it **Enable**, pick your email as the support email, **Save**.
3. Click **Add new provider**, choose **Anonymous**, switch it **Enable**, **Save**. (MOs use this: they never need a
   Google account. They are let in by the passphrase, not by this.)
4. Open the **Settings** tab, then **Authorized domains**. Click **Add domain** and add `mo.anawj.com`, then add
   `anawj.com` the same way. (`localhost` and the project's own domains are already there.)

## C. Create the database

1. In the left menu choose **Build > Firestore Database**, then **Create database**.
2. Location: choose **asia-southeast1 (Singapore)**. This cannot be changed later. Click Next.
3. Choose **Start in production mode** and **Create**. (The real rules come later, in step F.)

## D. Connect the web page to the project

1. Click the gear next to **Project Overview**, then **Project settings**.
2. Under **Your apps** click the **</>** (web) icon. App nickname: `mo-portal`. Leave "Firebase Hosting" unticked.
   Click **Register app**.
3. Copy the block that looks like `const firebaseConfig = { apiKey: "...", authDomain: "...", ... }`.
4. Open `mo-portal/js/firebase-config.js` and paste the values into the matching lines (apiKey, authDomain, projectId,
   storageBucket, messagingSenderId, appId). Keep the quotes. These values are public by design; commit them.
   Or just send the block to Claude and ask it to do this.

## E. Create the first records by hand

The rules below are not live yet, but the console always works, so you create the first records there.

1. In **Firestore Database > Data** click **Start collection**. Collection id: `config`. Document id: `access`.
   Add a field `passphrase`, type **string**, value: the shared passphrase for the MOs (at least 4 characters, easy to
   say aloud, e.g. three plain words). Save.
2. Click **Start collection** again. Collection id: `members`. Document id: **your own Google email, all lower case**
   (for example `you@gmail.com`). Add two **string** fields: `role` = `admin` and `name` = your name. Save.

Later you add other faculty inside the portal (Faculty tab), and change the passphrase there too. Changing the
passphrase signs every MO out until they enter the new one: do it when a new cohort starts.

## F. Put the rules live

The access rules are in `mo-portal/firestore.rules`. The easy, hands-off way is to let GitHub deploy them when the
change is merged, like the other apps:

1. Ask Claude to "add the MO portal to the Firestore rules workflow". It adds a matrix entry and a paths filter for
   `mo-portal/firestore.rules` to `.github/workflows/deploy-firestore-rules.yml` (nobody edits that file by hand).
2. In the Google Cloud console (https://console.cloud.google.com, choose the project `ntf-mo-portal` at the top), go to
   **IAM & Admin > IAM** and click **Grant access**.
3. New principal: `firebase-rules-deployer@apmes-logbook.iam.gserviceaccount.com`. Role: **Firebase Rules Admin**
   (type "Rules" in the role filter). Save.
4. Merge the workflow change. Check the **Deploy Firestore rules** run in the repo's Actions tab is green.

Until step F is done the database is in "production mode" and refuses everyone, so the portal cannot be used. You can
paste `firestore.rules` into **Firestore Database > Rules > Publish** as a one-off if you cannot wait, but the workflow
is the proper route.

## G. Check it works

1. Open `https://mo.anawj.com/` in a private window, enter a name and the passphrase: you should reach the test.
2. A wrong passphrase should be refused with a clear message.
3. In another window sign in as faculty with Google: you should see the question editor and results.

## Notes

- Costs: the free Spark plan is plenty for a few dozen MOs.
- Faculty who can read the Sessions list can see the current passphrase (it is stored in each login). That is accepted;
  the passphrase is a shared door code, not a secret.
- Deleting a question leaves its saved history behind (history is permanent by design).
