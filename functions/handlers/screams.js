const { db } = require("../util/admin");
const express = require("express");
const router = express.Router();
const { check, validationResult } = require("express-validator");
const auth = require("../util/Auth");

router.post(
  "/",
  [
    check("body", "body is required")
      .not()
      .isEmpty()
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.json({ errors: errors.array() });
    }
    const body = req.body.body;
    const userHandle = req.headers.handle;
    const newScream = {
      body,
      userHandle,
      userImage: req.headers.imageurl,
      likeCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString()
    };
    db.collection("screams")
      .add(newScream)
      .then(data => {
        const resScream = newScream;
        resScream.id = data.id;
        res.json(resScream);
      })
      .catch(err => {
        console.log(err);
        res.status(500).json({ error: "Server Error" });
      });
  }
);

//get all screams
router.get("/", async (req, res) => {
  try {
    screamsData = await db
      .collection("screams")
      .orderBy("createdAt", "desc")
      .get();
    resData = screamsData.docs.map(data => {
      cc = data.data();
      cc.id = data.id;
      return cc;
    });
    return res.status(201).json(resData);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ errors: error.code });
  }
});

router.get("/page/:pageSize/:page", async (req, res) => {
  try {
    let { pageSize, page } = req.params;
    pageSize = parseInt(pageSize);
    page = parseInt(page);
    let resData = {};
    screamColection = db.collection("screams").orderBy("createdAt", "desc");
    screamsData = await screamColection.get();
    resData.numPage = Math.round(screamsData.size / pageSize);
    screamsPage = await screamColection
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .get();
    resData.screams = screamsPage.docs.map(scream => {
      let data = scream.data();
      data.id = scream.id;
      return data;
    });
    res.json(resData);
  } catch (error) {
    console.log(error);
    res.status(500).json({ errors: error.code });
  }
});

//get screams by scream_id
router.get("/:screamId", async (req, res) => {
  resData = {};
  try {
    screamsData = await db.doc(`/screams/${req.params.screamId}`).get();
    if (screamsData.exists) {
      commentData = await db
        .collection("comments")
        .orderBy("createdAt", "desc")
        .where("screamId", "==", req.params.screamId)
        .get();
      resData = screamsData.data();
      resData.id = screamsData.id;
      resData.comments =
        commentData.docs.map(data => {
          return data.data();
        }) || [];
      return res.json(resData);
    } else {
      return res.json({ msg: " Scream not found " });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ errors: error.code });
  }
});

router.post(
  "/:screamId/comment",
  ([
    check("body")
      .not()
      .isEmpty()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.json({ errors: errors.array() });
    }
    const newCm = {
      body: req.body.body,
      createdAt: new Date().toISOString(),
      screamId: req.params.screamId,
      userHandle: req.headers.handle,
      userImage: req.headers.imageurl
    };
    const scream = await db.doc(`screams/${req.params.screamId}`).get();
    if (scream.exists) {
      await db.collection("comments").add(newCm);
      await db
        .doc(`screams/${req.params.screamId}`)
        .update({ commentCount: scream.data().commentCount + 1 });
      return res.json(newCm);
    } else {
      return res.json({ msg: " Scream not found " });
    }
  })
);

router.get("/:screamId/like", async (req, res) => {
  try {
    const scream = await db.doc(`screams/${req.params.screamId}`).get();
    if (scream.exists) {
      const like = await db
        .collection("likes")
        .where("screamId", "==", req.params.screamId)
        .where("userHandle", "==", req.headers.handle)
        .limit(1)
        .get();

      if (like.empty) {
        const newLikeSchema = {
          screamId: req.params.screamId,
          createdAt: new Date().toISOString(),
          userHandle: req.headers.handle,
          userImage: req.headers.imageurl
        };
        console.log(newLikeSchema);
        await db.collection("likes").add(newLikeSchema);
        await db
          .doc(`screams/${req.params.screamId}`)
          .update({ likeCount: scream.data().likeCount + 1 });
        return res.json(newLikeSchema);
      } else {
        return res.json({ msg: "Scream already liked" });
      }
    } else {
      return res.json({ msg: "scream not found" });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ errors: error.code });
  }
});
router.get("/:screamId/listLike", async (req, res) => {
  try {
    const listLikeStream = await db
      .collection("likes")
      .where("screamId", "==", req.params.screamId)
      .orderBy("createdAt", "desc")
      .get();
    const resData = listLikeStream.docs.map(data => {
      console.log(data);
      return data.data();
    });
    res.json(resData);
  } catch (e) {
    // statements
    console.log(e);
    return res.status(500).json({ errors: error.code });
  }
});
router.get("/:screamId/unlike", async (req, res) => {
  try {
    const scream = await db.doc(`screams/${req.params.screamId}`).get();
    if (scream.exists) {
      const like = await db
        .collection("likes")
        .where("screamId", "==", req.params.screamId)
        .where("userHandle", "==", req.headers.handle)
        .limit(1)
        .get();

      if (!like.empty) {
        await db.doc(`likes/${like.docs[0].id}`).delete();
        await db
          .doc(`screams/${req.params.screamId}`)
          .update({ likeCount: scream.data().likeCount - 1 });
        return res.json({ msg: "unlike successful" });
      } else {
        return res.json({ msg: "Server Error" });
      }
    } else {
      return res.json({ msg: "scream not found" });
    }
  } catch (error) {
    return res.status(500).json({ errors: error.code });
  }
});

router.delete("/:screamId", async (req, res) => {
  try {
    const scream = await db.doc(`screams/${req.params.screamId}`).get();
    if (scream.exists) {
      if (scream.data().userHandle != req.headers.handle) {
        return res.status(403).json({ msg: "Unauthorized" });
      }
      await db.doc(`screams/${req.params.screamId}`).delete();
      res.json({ msg: "Scream deleted successfully" });
    } else {
      return res.json({ msg: "Scream not found" });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ errors: error.code });
  }
});

module.exports = router;
