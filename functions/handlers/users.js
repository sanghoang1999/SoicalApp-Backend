const firebaseConfig = require("../util/config");
const firebase = require("firebase");
const config = require("../util/config");
const uuid = require("uuid");
const { db, admin, rdb } = require("../util/admin");
const path = require("path");
const os = require("os");
const fs = require("fs");
const express = require("express");
const router = express.Router();
const { check, validationResult } = require("express-validator");
const BusBoy = require("busboy");
const jimp = require("jimp");
const auth = require("../util/Auth");
const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config");
firebase.initializeApp(firebaseConfig);

router.post(
  "/signup",
  [
    check("handle", "handle is required")
      .not()
      .isEmpty(),
    check("email", "Please enter a valid email").isEmail(),
    check(
      "password",
      "Please enter password with  6 or more character"
    ).isLength({ min: 6 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.json({ errors: errors.array() });
    }
    const { email, password, handle } = req.body;
    try {
      const data = await db.doc(`/users/${handle}`).get();
      if (data.exists) {
        return res.json({ errors: [{ msg: "handle has been used" }] });
      }
      const newAuth = await firebase
        .auth()
        .createUserWithEmailAndPassword(email, password);

      const newUser = {
        handle,
        email,
        createdAt: new Date().toISOString(),

        imageurl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/nobody.png?alt=media`,
        userId: newAuth.user.uid
      };
      await db.doc(`/users/${handle}`).set(newUser);
      const user = await db
        .collection("users")
        .where("userId", "==", newUser.userId)
        .limit(1)
        .get();
      const uid = uuid();
      const payload = {
        handle: user.docs[0].data().handle,
        imageurl: user.docs[0].data().imageurl
      };
      jwt.sign(payload, jwtSecret, { expiresIn: "1h" }, (err, token) => {
        if (err) throw err;
        res.json({ token });
      });
    } catch (error) {
      console.log(error);
      if (error.code === "auth/email-already-in-use") {
        return res.json({ errors: [{ msg: "Email has been used" }] });
      }
      if (error.code === "auth/weak-password") {
        return res.json({
          errors: [{ msg: "Password should be at least 6 characters" }]
        });
      }
      res.status(500).json("Server Error");
    }
  }
);

router.post(
  "/login",
  [check("email", "Please enter a valid email").isEmail()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.json({ errors: errors.array() });
    }
    const { email, password } = req.body;
    try {
      const data = await firebase
        .auth()
        .signInWithEmailAndPassword(email, password);
      const user = await db
        .collection("users")
        .where("userId", "==", data.user.uid)
        .limit(1)
        .get();
      const uid = uuid();
      const payload = {
        handle: user.docs[0].data().handle,
        imageurl: user.docs[0].data().imageurl
      };
      jwt.sign(payload, jwtSecret, { expiresIn: "1h" }, (err, token) => {
        if (err) throw err;
        res.json({ token });
      });
    } catch (error) {
      console.log(error);
      if (error.code === "auth/wrong-password") {
        return res.json({ errors: [{ msg: "Password is wrong" }] });
      }
      if (error.code === "auth/user-not-found") {
        return res.json({ errors: [{ msg: "Email is not exist" }] });
      }
      res.status(500).json("Server Error");
    }
  }
);

router.post("/image", auth, (req, res) => {
  const busboy = new BusBoy({ headers: req.headers });
  let filepath;
  let mimetype;
  let imageFileName;
  busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
    if (mimetype !== "image/jpeg" && mimetype !== "image/png") {
      return res.json({ errors: "Wrong file type submitted" });
    }
    const imageExtension = filename.split(".")[filename.split(".").length - 1];

    var imgBuffer = [];

    file.on("data", chunk => imgBuffer.push(chunk));
    file.on("end", async chunk => {
      imgBuffer = Buffer.concat(imgBuffer);
      const prevNameFile = await resize(
        imgBuffer,
        256,
        256,
        5,
        imageExtension,
        mimetype,
        req.user.handle
      );
      const newNameFile = await resize(
        imgBuffer,
        256,
        256,
        100,
        imageExtension,
        mimetype,
        req.user.handle,
        prevNameFile
      );
      req.user.imageurl = prevNameFile;
      res.json({ msg: "image uploaded successfully" });
    });
  });

  busboy.end(req.rawBody);
});

async function resize(
  buffer,
  width,
  height,
  quantity,
  imageExtension,
  mimetype,
  userHandle,
  filename = ""
) {
  let imageFileName = "";
  if (filename.length == 0) {
    imageFileName =
      `${Math.round(Math.random() * 100000000000)}` +
      `${quantity == 100 ? "_high" : "_low"}` +
      "." +
      imageExtension;
  } else {
    imageFileName = filename.replace("_low", "_high");
  }
  console.log(imageFileName);

  filepath = path.join(os.tmpdir(), imageFileName);

  try {
    img = await jimp.read(buffer);
    await img
      .resize(width, height)
      .quality(quantity)
      .write(filepath);
    await admin
      .storage()
      .bucket()
      .upload(filepath, {
        resumable: false,
        metadata: {
          metadata: {
            contentType: mimetype
          }
        }
      });
    if (quantity === 100) {
      const imageurl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
      await db.doc(`users/${userHandle}`).update({ imageurl });
    }
    return imageFileName;
  } catch (error) {
    console.log(error);
    res.status(500).json("Server Error");
  }
}

router.post(
  "/detail",

  [
    check("bio")
      .not()
      .isEmpty(),
    check("website")
      .not()
      .isEmpty(),
    check("location")
      .not()
      .isEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.json({ errors: errors.array() });
    }
    let { bio, website, location } = req.body;
    if (website.trim().substring(0, 5) !== "https") {
      website = `https://${req.body.website}`;
    }
    try {
      await db
        .doc(`/users/${req.headers.handle}`)
        .update({ bio, website, location });
      return res.json({ msg: "Details added successfully" });
    } catch (error) {
      console.log(error);
      return res.status(500).json({ errors: error.code });
    }
  }
);

router.get("/me", async (req, res) => {
  try {
    const resData = {};
    const userData = await db.doc(`/users/${req.headers.handle}`).get();
    if (userData.exists) {
      const likes = await db
        .collection("likes")
        .where("userHandle", "==", req.headers.handle)
        .get();
      resData.credentials = userData.data();
      resData.likes =
        likes.docs.map(like => {
          return like.data();
        }) || [];
      const notifications = await db
        .collection("notifications")
        .where("recipient", "==", req.headers.handle)
        .orderBy("createdAt", "desc")
        .limit(10)
        .get();
      resData.notifications =
        notifications.docs.map(noti => {
          let temp = noti.data();
          temp.notificationId = noti.id;
          return temp;
        }) || [];
      return res.status(201).json(resData);
    } else {
      return res.json({ msg: " No user Detail " });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ errors: error.code });
  }
});

//get any user detail

router.get("/:handle", async (req, res) => {
  console.log("emvuidi");
  try {
    resData = {};
    const userData = await db.doc(`users/${req.params.handle}`).get();
    if (userData.exists) {
      resData.user = userData.data();
      const screamData = await db
        .collection("screams")
        .where("userHandle", "==", req.params.handle)
        .orderBy("createdAt", "desc")
        .get();
      resData.screams =
        screamData.docs.map(scream => {
          let data = scream.data();
          data.id = scream.id;
          return data;
        }) || [];
      return res.status(201).json(resData);
    } else {
      return res.json({ msg: " No user Detail " });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ errors: error.code });
  }
});

router.post("/notifications", async (req, res) => {
  console.log("emvuidi");
  let batch = db.batch();
  req.body.forEach(notificationId => {
    const notification = db.doc(`/notifications/${notificationId}`);
    batch.update(notification, { read: true });
  });
  req.body.forEach(notificationId => {
    rdb
      .ref(`notifications`)
      .child(notificationId)
      .remove();
  });
  batch
    .commit()
    .then(() => {
      return res.json({ message: "Notifications marked read" });
    })
    .catch(err => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
});
router.get("/tool/cc", async (req, res) => {
  console.log("emvuidi");
  let batch = db.batch();
  let notis = await db.collection("notifications").get();
  notis.docs.map(doc => {
    batch.set(db.doc(`/notifications/${doc.id}`), { _id: doc.id });
  });
  batch
    .commit()
    .then(() => {
      return res.json({ message: "Notifications marked read" });
    })
    .catch(err => {
      console.error(err);
      return res.status(500).json({ error: err.code });
    });
});

module.exports = router;
