import OpenAI from "openai";
const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");

const app = express();
app.use(cors());
app.use(express.json());

const prisma = new PrismaClient();

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

/**
 * POST /experiment/runOnePrompt
 * Body:
 * {
 *   "userPrompt": "User's prompt or query text"
 * }
 *
 * This endpoint does the following:
 * 1) Creates a new Experiment (using the userPrompt as either name or systemPrompt).
 * 2) Creates one TestCase for that prompt and links it to the Experiment (ExperimentTestCase).
 * 3) Creates an ExperimentRun (like a "session" for comparing LLMs).
 * 4) Simulates calling 3 different LLMs, measuring each call’s time (random sleep).
 * 5) Stores each response in the Result table (one per LLM).
 * 6) Returns the 3 responses + timings + an aggregate score.
 */
app.post("/experiment/runOnePrompt", async (req, res) => {
  console.log("POST /experiment/runOnePrompt called");
  const { userPrompt } = req.body;
  if (!userPrompt) {
    return res
      .status(400)
      .json({ error: "Missing 'userPrompt' in request body" });
  }

  try {
    //
    // 1) Create an Experiment
    //
    const experiment = await prisma.experiment.create({
      data: {
        // We'll store the prompt in 'systemPrompt' just to reuse an existing field
        // Or you could store it in 'name' if you prefer
        name: `Single-Prompt Experiment`,
        systemPrompt: userPrompt,
        modelName: "Comparing 3 LLMs",
      },
    });

    //
    // 2) Create one TestCase for that prompt
    //
    const testCase = await prisma.testCase.create({
      data: {
        userMessage: userPrompt,
        expectedOutput: "N/A (not used in this simple scenario)",
        graderType: "auto", // e.g. "gpt4_eval" if you want to keep it consistent
      },
    });

    // Link the TestCase to the Experiment via the join table
    await prisma.experimentTestCase.create({
      data: {
        experimentId: experiment.id,
        testCaseId: testCase.id,
      },
    });

    //
    // 3) Create an ExperimentRun
    //
    const experimentRun = await prisma.experimentRun.create({
      data: {
        experimentId: experiment.id,
        runName: "Single Prompt Run",
      },
    });

    //
    // 4) Simulate calling 3 LLMs side by side
    //
    const llmModels = ["LLM1", "LLM2", "LLM3"];
    const responses = [];

    for (const model of llmModels) {
      const start = Date.now();

      // Simulated delay: 200-700ms. Replace with a real LLM API call if needed.
      await new Promise((resolve) =>
        setTimeout(resolve, 200 + Math.random() * 500)
      );

      const end = Date.now();
      const timeMs = end - start;

      // We'll simulate a random "score" from 1 to 5
      const score = Math.floor(Math.random() * 5) + 1;

      // Fake LLM text
      const llmResponse = `Simulated response from ${model} for prompt: "${userPrompt}"`;

      //
      // 5) Create a Result row
      //
      await prisma.result.create({
        data: {
          experimentRunId: experimentRun.id,
          testCaseId: testCase.id,
          llmResponse,
          score,
          graderDetails: `Auto-graded for demonstration. Model used: ${model}`,
        },
      });

      responses.push({
        model,
        responseText: llmResponse,
        timeMs,
        score,
      });
    }

    //
    // 6) Compute an aggregate score
    //
    let avgScore = 0;
    if (responses.length > 0) {
      avgScore =
        responses.reduce((sum, r) => sum + r.score, 0) / responses.length;
    }

    // Update the run with the final aggregate score + completedAt
    await prisma.experimentRun.update({
      where: { id: experimentRun.id },
      data: {
        aggregateScore: avgScore,
        completedAt: new Date(),
      },
    });

    // Return all relevant info
    res.json({
      experimentId: experiment.id,
      experimentRunId: experimentRun.id,
      testCaseId: testCase.id,
      responses,
      aggregateScore: avgScore,
    });
  } catch (error) {
    console.error("Error in /experiment/runOnePrompt:", error);
    res
      .status(500)
      .json({ error: "Failed to run the single prompt experiment" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
