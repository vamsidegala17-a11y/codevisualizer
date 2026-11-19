import type { SupportedLanguage } from '../types/visualizer';

export interface SampleSnippet {
  id: string;
  title: string;
  language: Exclude<SupportedLanguage, 'auto'>;
  subtitle: string;
  code: string;
}

export const SAMPLE_SNIPPETS: SampleSnippet[] = [
  {
    id: 'js-sum-function',
    title: 'Variables, Functions & Arrays',
    language: 'javascript',
    subtitle: 'JavaScript · Live AST Execution Trace',
    code: `function calculateDiscount(prices, discountRate) {
  let subtotal = 0;

  for (let i = 0; i < prices.length; i++) {
    subtotal = subtotal + prices[i];
  }

  const savings = subtotal * discountRate;
  const finalTotal = subtotal - savings;
  return finalTotal;
}

const cart = [25, 40, 35];
const total = calculateDiscount(cart, 0.2);
console.log("Final Total:", total);`,
  },
  {
    id: 'react-counter',
    title: 'React State & Derived Totals',
    language: 'react',
    subtitle: 'React · Hooks & Component Tree',
    code: `import { useState, useEffect } from "react";

function PriceSummary({ totalItems, totalPrice }) {
  return (
    <div className="summary">
      <p>Items: {totalItems}</p>
      <strong>Total: \${totalPrice.toFixed(2)}</strong>
    </div>
  );
}

export default function ShoppingBag() {
  const [count, setCount] = useState(1);
  const unitPrice = 24.5;
  const total = count * unitPrice;

  useEffect(() => {
    document.title = \`Bag (\${count})\`;
  }, [count]);

  return (
    <section>
      <button onClick={() => setCount(count + 1)}>Add Item</button>
      <PriceSummary totalItems={count} totalPrice={total} />
    </section>
  );
}`,
  },
  {
    id: 'python-grades',
    title: 'Python Loops & Dictionaries',
    language: 'python',
    subtitle: 'Python · Control Flow & Data Structures',
    code: `def analyze_scores(scores):
    passed = []
    total = 0

    for student, score in scores.items():
        total += score
        if score >= 70:
            passed.append(student)

    average = total / len(scores)
    return {"average": average, "passed": passed}

classroom = {"Maya": 88, "Liam": 64, "Noah": 92}
report = analyze_scores(classroom)
print("Report:", report)`,
  },
  {
    id: 'laravel-controller',
    title: 'Laravel Route, Controller & Eloquent',
    language: 'laravel',
    subtitle: 'Laravel · MVC Request Lifecycle',
    code: `<?php

namespace App\\Http\\Controllers;

use App\\Models\\Order;
use Illuminate\\Http\\Request;

class OrderController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'product_id' => 'required|integer',
            'quantity' => 'required|integer|min:1',
        ]);

        $order = Order::create([
            'user_id' => $request->user()->id,
            'product_id' => $validated['product_id'],
            'quantity' => $validated['quantity'],
            'status' => 'pending',
        ]);

        return response()->json($order, 201);
    }
}`,
  },
  {
    id: 'nodejs-express',
    title: 'Node.js & Express API Route',
    language: 'nodejs',
    subtitle: 'Node.js · Middleware & Async Handler',
    code: `import express from "express";

const app = express();
app.use(express.json());

app.get("/api/users/:id", async (req, res) => {
  const userId = Number(req.params.id);

  if (Number.isNaN(userId)) {
    return res.status(400).json({ error: "Invalid user ID" });
  }

  const user = { id: userId, name: "Ava Chen", role: "member" };
  return res.json({ data: user });
});`,
  },
  {
    id: 'sql-orders-join',
    title: 'SQL Join & Aggregation Query',
    language: 'sql',
    subtitle: 'SQL · Relational Filtering & Grouping',
    code: `SELECT
  c.customer_name,
  COUNT(o.id) AS total_orders,
  SUM(o.amount) AS total_spent
FROM customers c
INNER JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'completed'
GROUP BY c.customer_name
HAVING SUM(o.amount) > 100
ORDER BY total_spent DESC;`,
  },
];
