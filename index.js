const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const port = process.env.PORT || 8000;
const app = express();
const axios = require("axios"); // added last

app.use(
  cors({
    origin: [
      "https://techzen-d931f.web.app",
      "http://localhost:5173",
      "https://techzen-d931f.firebaseapp.com",
    ],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

app.use(express.json());
app.use(cookieParser());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.uqfy7cb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Verify Token Middleware
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  console.log(token);
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err);
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

async function run() {
  try {
    const db = client.db("TechZen");
    const productsCollection = db.collection("products");
    const usersCollection = db.collection("users");

    // auth related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
      console.log(process.env.NODE_ENV);
    });

    // Logout
    app.post("/logout", async (req, res) => {
      try {
        res
          .clearCookie("token", {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          })
          .send({ success: true });
        console.log("Logout successful");
      } catch (err) {
        res.status(500).send(err);
      }
    });

    // save a user data in db with email, name, role, photo and timestamp
    app.put("/user", async (req, res) => {
      const user = req.body;
      console.log(req.body);
      // chack if user already exist in db
      const isExist = await usersCollection.findOne({ email: user.email });
      if (isExist) {
        return res.send(isExist);
      }
      // save user for the first time
      const options = { upsert: true };
      const query = { email: user.email };
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    // get a user info by email from db
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });

    // get all users data from db
    app.get("/users", verifyToken, async (req, res) => {
      const result = await usersCollection.find({}).toArray();
      res.send(result);
    });

    // get all products data from db
    app.get("/products", async (req, res) => {
      const result = await productsCollection.find({}).toArray();
      res.send(result);
    });

    // get the form info and filter products based on that
    app.post("/form-data", async (req, res) => {
      const { category, brand, priceRange, sortBy } = req.body;
      const query = {};

      // Build the query based on the form data
      if (category && category !== "default") query.category = category;
      if (brand && brand !== "default") query.brand = brand;
      if (priceRange && priceRange !== "default") {
        if (priceRange === "below5k") {
          query.price = { $lt: 5000 };
        } else if (priceRange === "5kTo20k") {
          query.price = { $gte: 5000, $lte: 20000 };
        } else if (priceRange === "above20k") {
          query.price = { $gt: 20000 };
        }
      }

      try {
        const result = await productsCollection.find(query).toArray();

        // Sort the results if sortBy is specified
        if (sortBy && sortBy !== "default") {
          if (sortBy === "price-asc") {
            result.sort((a, b) => a.price - b.price);
          } else if (sortBy === "price-desc") {
            result.sort((a, b) => b.price - a.price);
          } else if (sortBy === "newest-first") {
            result.sort((a, b) => new Date(b.addedOn) - new Date(a.addedOn));
          }
        }

        res.send(result);
      } catch (error) {
        console.error("Error filtering products:", error);
        res.status(500).send({ error: "Failed to filter products" });
      }
    });

    // filter the products based on the search
    app.get("/search", async (req, res) => {
      const { query } = req.query;
      try {
        const result = await productsCollection
          .find({ name: { $regex: query, $options: "i" } })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Error searching products:", error);
        res.status(500).send({ error: "Failed to search products" });
      }
    });

    // imgbb related
    app.post("/upload", async (req, res) => {
      try {
        const response = await axios.post(
          "https://api.imgbb.com/1/upload",
          req.body
        );
        res.send(response.data);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Error uploading image" });
      }
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from TechZen Server..");
});

app.listen(port, () => {
  console.log(`TechZen is running on port ${port}`);
});
