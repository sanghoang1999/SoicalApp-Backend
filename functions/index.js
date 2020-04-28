const functions = require("firebase-functions");
const express = require("express");
const { db, rdb } = require("./util/admin");
const auth = require("./util/Auth");
const busboy = require("busboy");
const app = express();
const cors = require("cors");
app.use(cors());

app.use(express.json());

app.use("/user", require("./handlers/users"));
app.use("/scream", require("./handlers/screams"));

exports.api = functions.region("asia-east2").https.onRequest(app);

exports.createNotificationOnLike = functions
  .region("asia-east2")
  .firestore.document("/likes/{id}")
  .onCreate(async snapshot => {
    const scream = await db.doc(`/screams/${snapshot.data().screamId}`).get();
    if (
      scream.exists &&
      scream.data().userHandle !== snapshot.data().userHandle
    ) {
      await db.doc(`/notifications/${snapshot.id}`).set({
        createdAt: new Date().toISOString(),
        recipient: scream.data().userHandle,
        sender: snapshot.data().userHandle,
        userImage: snapshot.data().userImage,
        type: "like",
        read: false,
        screamId: scream.id
      });
      await rdb
        .ref("notifications")
        .child(`${snapshot.id}`)
        .set({
          createdAt: new Date().toISOString(),
          recipient: scream.data().userHandle,
          sender: snapshot.data().userHandle,
          userImage: snapshot.data().userImage,
          type: "like",
          read: false,
          screamId: scream.id,
          _id: snapshot.id
        });
    }
  });
exports.deleteNotificationOnUnLike = functions
  .region("asia-east2")
  .firestore.document("likes/{id}")
  .onDelete(async snapshot => {
    await db.doc(`/notifications/${snapshot.id}`).delete();
  });

exports.createNotificationOnComment = functions
  .region("asia-east2")
  .firestore.document("/comments/{id}")
  .onCreate(async snapshot => {
    const scream = await db.doc(`/screams/${snapshot.data().screamId}`).get();
    if (
      scream.exists &&
      scream.data().userHandle !== snapshot.data().userHandle
    ) {
      await db.doc(`/notifications/${snapshot.id}`).set({
        createdAt: new Date().toISOString(),
        recipient: scream.data().userHandle,
        userImage: snapshot.data().userImage,
        sender: snapshot.data().userHandle,
        type: "comment",
        read: false,
        screamId: scream.id,
        _id: snapshot.id
      });
      await rdb
        .ref("notifications")
        .child(`${snapshot.id}`)
        .set({
          createdAt: new Date().toISOString(),
          recipient: scream.data().userHandle,
          userImage: snapshot.data().userImage,
          sender: snapshot.data().userHandle,
          type: "comment",
          read: false,
          screamId: scream.id
        });
    }
  });

exports.onUserImageChange = functions
  .region("asia-east2")
  .firestore.document("/users/{userId}")
  .onUpdate(change => {
    console.log(change.before.data());
    console.log(change.after.data());
    if (change.before.data().imageUrl !== change.after.data().imageUrl) {
      console.log("image has changed");
      const batch = db.batch();
      db.collection("screams")
        .where("userHandle", "==", change.before.data().handle)
        .get()
        .then(data => {
          data.forEach(doc => {
            const scream = db.doc(`/screams/${doc.id}`);
            batch.update(scream, { userImage: change.after.data().imageUrl });
          });
          return null;
        })
        .then(() => {
          db.collection("likes")
            .where("userHandle", "==", change.before.data().handle)
            .get()
            .then(data => {
              data.forEach(doc => {
                const likes = db.doc(`/likes/${doc.id}`);
                batch.update(likes, {
                  userImage: change.after.data().imageUrl
                });
              });
              return null;
            })
            .then(() => {
              db.collection("comments")
                .where("userHandle", "==", change.before.data().handle)
                .get()
                .then(data => {
                  data.forEach(doc => {
                    const comments = db.doc(`/comments/${doc.id}`);
                    batch.update(comments, {
                      userImage: change.after.data().imageUrl
                    });
                  });
                })
                .then(() => {
                  return batch.commit();
                });
            });
        });
    } else return true;
  });

exports.onScreamDelete = functions
  .region("asia-east2")
  .firestore.document("/screams/{screamId}")
  .onDelete((snapshot, context) => {
    const screamId = context.params.screamId;
    const batch = db.batch();
    return db
      .collection("comments")
      .where("screamId", "==", screamId)
      .get()
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/comments/${doc.id}`));
        });
        return db
          .collection("likes")
          .where("screamId", "==", screamId)
          .get();
      })
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/likes/${doc.id}`));
        });
        return db
          .collection("notifications")
          .where("screamId", "==", screamId)
          .get();
      })
      .then(data => {
        data.forEach(doc => {
          batch.delete(db.doc(`/notifications/${doc.id}`));
        });
        return batch.commit();
      })
      .catch(err => console.error(err));
  });
