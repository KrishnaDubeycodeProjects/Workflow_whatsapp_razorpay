"use client";

import React, { useState, useMemo } from "react";
import { Calculator, IndianRupee, Percent, Clock, ChevronDown } from "lucide-react";

interface MortgageCalculatorProps {
  initialPriceStr?: string;
}

export default function MortgageCalculator({ initialPriceStr = "₹2.5 Cr" }: MortgageCalculatorProps) {
  // Parse numeric value from string (e.g. "₹2.75 Cr" -> 27500000, "₹80 Lakh" -> 8000000)
  const defaultAmount = useMemo(() => {
    const raw = initialPriceStr.toLowerCase();
    const crMatch = raw.match(/([\d\.]+)\s*(cr|crore)/);
    if (crMatch) return Math.round(parseFloat(crMatch[1]) * 10000000);
    const lakhMatch = raw.match(/([\d\.]+)\s*(lakh|lac)/);
    if (lakhMatch) return Math.round(parseFloat(lakhMatch[1]) * 100000);
    const num = parseInt(raw.replace(/\D/g, ""), 10);
    return isNaN(num) || num === 0 ? 25000000 : num;
  }, [initialPriceStr]);

  const [loanAmount, setLoanAmount] = useState(Math.round(defaultAmount * 0.8)); // 80% loan default
  const [interestRate, setInterestRate] = useState(8.5); // 8.5% default in India
  const [tenureYears, setTenureYears] = useState(20);
  const [isOpen, setIsOpen] = useState(false);

  // EMI Formula: P * r * (1+r)^n / ((1+r)^n - 1)
  const { monthlyEmi, totalPayment, totalInterest } = useMemo(() => {
    const p = loanAmount;
    const r = interestRate / 12 / 100;
    const n = tenureYears * 12;

    if (p <= 0 || r <= 0 || n <= 0) {
      return { monthlyEmi: 0, totalPayment: 0, totalInterest: 0 };
    }

    const emi = Math.round((p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
    const total = emi * n;
    const interest = total - p;

    return {
      monthlyEmi: emi,
      totalPayment: total,
      totalInterest: interest > 0 ? interest : 0,
    };
  }, [loanAmount, interestRate, tenureYears]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  const principalPercent = totalPayment > 0 ? Math.round((loanAmount / totalPayment) * 100) : 50;
  const interestPercent = 100 - principalPercent;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-xl transition-all">
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base">Estimated Home Loan &amp; EMI</h3>
            <p className="text-xs text-neutral-400">
              Calculate monthly installment from {interestRate}% p.a.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-bold text-amber-400">{formatCurrency(monthlyEmi)}/mo</div>
            <div className="text-[10px] text-neutral-500">{tenureYears} Years @ {interestRate}%</div>
          </div>
          <button
            className={`p-1.5 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white transition duration-200 ${
              isOpen ? "rotate-180" : ""
            }`}
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="mt-6 pt-6 border-t border-neutral-800 space-y-5 animate-in fade-in duration-200">
          {/* Result Card */}
          <div className="bg-neutral-950/80 border border-neutral-800/80 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-xs text-neutral-400 uppercase tracking-wider">Estimated Monthly EMI</span>
              <div className="text-2xl sm:text-3xl font-extrabold text-amber-400 mt-0.5">
                {formatCurrency(monthlyEmi)}
                <span className="text-xs font-normal text-neutral-400 ml-1">/ month</span>
              </div>
            </div>

            {/* Split Progress Bar */}
            <div className="w-full sm:w-56 space-y-1.5">
              <div className="flex justify-between text-[11px] text-neutral-400 font-medium">
                <span className="text-emerald-400">Principal: {principalPercent}%</span>
                <span className="text-amber-400">Interest: {interestPercent}%</span>
              </div>
              <div className="h-2 w-full bg-neutral-800 rounded-full overflow-hidden flex">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${principalPercent}%` }}
                />
                <div
                  className="bg-amber-400 h-full transition-all duration-300"
                  style={{ width: `${interestPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-neutral-500">
                <span>Total: {formatCurrency(totalPayment)}</span>
              </div>
            </div>
          </div>

          {/* Sliders */}
          <div className="space-y-4">
            {/* Loan Amount */}
            <div>
              <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                <span>Loan Amount</span>
                <span className="font-bold text-white font-mono">{formatCurrency(loanAmount)}</span>
              </div>
              <input
                type="range"
                min={1000000}
                max={Math.max(100000000, defaultAmount * 1.5)}
                step={500000}
                value={loanAmount}
                onChange={(e) => setLoanAmount(Number(e.target.value))}
                className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>

            {/* Interest Rate & Tenure Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Interest Rate</span>
                  <span className="font-bold text-white font-mono">{interestRate}%</span>
                </div>
                <input
                  type="range"
                  min={6.5}
                  max={14.0}
                  step={0.1}
                  value={interestRate}
                  onChange={(e) => setInterestRate(Number(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-neutral-300 mb-1.5">
                  <span>Tenure</span>
                  <span className="font-bold text-white font-mono">{tenureYears} Years</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={30}
                  step={1}
                  value={tenureYears}
                  onChange={(e) => setTenureYears(Number(e.target.value))}
                  className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>
            </div>
          </div>

          <div className="text-[11px] text-neutral-500 italic">
            *Indicative estimate based on standard reducing balance method. Subject to bank approval and final credit terms.
          </div>
        </div>
      )}
    </div>
  );
}
