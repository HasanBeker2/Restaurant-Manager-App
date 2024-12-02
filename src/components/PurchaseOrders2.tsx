// src/components/PurchaseOrders.tsx

import React, { useState, useEffect, useRef } from "react";
import Layout from "./Layout";
import { Download, Trash2, Edit2, Plus, Filter } from "lucide-react";
import jsPDF from "jspdf";
import "jspdf-autotable";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import dayjs from "dayjs";

declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: AutoTableOptions) => jsPDF;
  }
}

interface AutoTableOptions {
  head: string[][];
  body: (string | number)[][];
  startY?: number;
  [key: string]: any;
}

interface PurchaseOrdersProps {
  logo: string;
  restaurantName: string;
}

interface PurchaseOrder {
  id: string;
  date: string;
  invoiceNumber: string;
  product: string;
  supplier: string;
  quantity: number;
  costOfUnit: number;
  costOfUnitOfMeasure: number;
  purchUnitQty: number;
  unitOfMeasure: string;
  purchaseUnit: string;
  totalCost: number;
}

interface RawGood {
  id: string;
  name: string;
  qtyOnHand: number;
  averageCostOfUnitOfMeasure: number;
  lastCostOfUnitOfMeasure: number;
  unitOfMeasure: string;
  purchaseUnit: string;
  costOfUnit: number;
  purchUnitQty: number;
  date?: Timestamp;
}

interface TempProduct {
  product: string;
  quantity: number;
  costOfUnit: number;
  costOfUnitOfMeasure: number;
  purchUnitQty: number;
  unitOfMeasure: string;
  purchaseUnit: string;
  totalCost: number;
}

const initialPurchaseOrderHeader = {
  date: new Date().toISOString().split("T")[0],
  supplier: "",
  invoiceNumber: "",
};

const initialProduct: TempProduct = {
  product: "",
  quantity: 0,
  costOfUnit: 0,
  purchUnitQty: 0,
  unitOfMeasure: "",
  purchaseUnit: "",
  totalCost: 0,
  costOfUnitOfMeasure: 0,
};

const unitMultipliers: { [key: string]: number } = {
  Grams: 1,
  Kilograms: 1000,
  Milliliters: 1,
  Litre: 1000,
  Count: 1,
};

const PurchaseOrders: React.FC<PurchaseOrdersProps> = ({
  logo,
  restaurantName,
}) => {
  const [purchaseOrderList, setPurchaseOrderList] = useState<PurchaseOrder[]>([]);
  const [purchaseOrderHeader, setPurchaseOrderHeader] = useState(initialPurchaseOrderHeader);
  const [tempProducts, setTempProducts] = useState<TempProduct[]>([]);
  const [showProductForm, setShowProductForm] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<TempProduct>(initialProduct);
  const [editingPurchaseOrderId, setEditingPurchaseOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLoggedIn, setUserLoggedIn] = useState<boolean | null>(null);
  const [inputErrors, setInputErrors] = useState<{ [key: string]: string }>({});
  const [rawGoodsList, setRawGoodsList] = useState<RawGood[]>([]);
  const [supplierList, setSupplierList] = useState<string[]>([]);
  const [productError, setProductError] = useState<string>("");
  const [filterPopupVisible, setFilterPopupVisible] = useState<{ [key: string]: boolean }>({});
  const [filters, setFilters] = useState<{ [key: string]: any }>({});
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "ascending" | "descending";
  } | null>(null);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });
  const filterTimers = useRef<{ [key: string]: NodeJS.Timeout }>({});

  // Convert quantities to base units using unit multipliers
  const convertToBaseUnit = (quantity: number, unitOfMeasure: string): number => {
    const multiplier = unitMultipliers[unitOfMeasure] || 1;
    return quantity * multiplier;
  };

  // Convert base units to display units using unit multipliers
  const convertFromBaseUnit = (
    quantity: number,
    unitOfMeasure: string
  ): number => {
    const multiplier = unitMultipliers[unitOfMeasure] || 1;
    return quantity / multiplier;
  };

  // Handle changes in the purchase order header form
  const handleHeaderChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setPurchaseOrderHeader((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Check if the form has the necessary information to add a product
  const canAddProduct = () => {
    return (
      purchaseOrderHeader.date &&
      purchaseOrderHeader.supplier &&
      purchaseOrderHeader.invoiceNumber
    );
  };

  // Check for duplicate products in the current order (only when adding)
  const checkDuplicateProduct = (product: string) => {
    return tempProducts.some((p) => p.product === product);
  };

  // Monitor authentication state
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserLoggedIn(true);
      } else {
        setUserLoggedIn(false);
        setLoading(false);
        setError("No user logged in. Please log in to view purchase orders.");
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Fetch data when user is logged in
  useEffect(() => {
    let unsubscribePurchaseOrders: () => void;

    const fetchData = async () => {
      if (!auth.currentUser) return;

      try {
        // Fetch Purchase Orders ordered by date descending
        const purchaseOrdersRef = collection(db, "purchaseOrders");
        const q = query(
          purchaseOrdersRef,
          where("userId", "==", auth.currentUser.uid),
          orderBy("date", "desc") // Order by date descending
        );

        unsubscribePurchaseOrders = onSnapshot(q, (querySnapshot) => {
          const purchaseOrders = querySnapshot.docs.map((doc) => {
            const data = doc.data();
            let formattedDate = "";

            if (data.date) {
              if (data.date instanceof Timestamp) {
                formattedDate = dayjs(data.date.toDate()).format("MM/DD/YYYY");
              } else {
                // If date is stored as string
                formattedDate = dayjs(data.date).format("MM/DD/YYYY");
              }
            } else {
              formattedDate = "N/A";
            }

            return {
              id: doc.id,
              date: formattedDate,
              invoiceNumber: data.invoiceNumber || "",
              product: data.product || "",
              supplier: data.supplier || "",
              quantity: Number(data.quantity) || 0,
              costOfUnit: Number(data.costOfUnit) || 0,
              costOfUnitOfMeasure: Number(data.costOfUnitOfMeasure) || 0,
              purchUnitQty: Number(data.purchUnitQty) || 0,
              unitOfMeasure: data.unitOfMeasure || "",
              purchaseUnit: data.purchaseUnit || "",
              totalCost: Number(data.totalCost) || 0,
            } as PurchaseOrder;
          });

          console.log("Fetched Purchase Orders:", purchaseOrders);
          setPurchaseOrderList(purchaseOrders);
          setLoading(false);
        });

        // Fetch Raw Goods
        const rawGoodsRef = collection(db, "rawGoods");
        const rawGoodsSnapshot = await getDocs(
          query(rawGoodsRef, where("userId", "==", auth.currentUser.uid))
        );
        const rawGoods = rawGoodsSnapshot.docs.map((doc) => ({
          id: doc.id,
          name: doc.data().name || "",
          qtyOnHand: Number(doc.data().qtyOnHand) || 0,
          averageCostOfUnitOfMeasure: Number(doc.data().averageCostOfUnitOfMeasure) || 0,
          lastCostOfUnitOfMeasure: Number(doc.data().lastCostOfUnitOfMeasure) || 0,
          unitOfMeasure: doc.data().unitOfMeasure || "",
          purchaseUnit: doc.data().purchaseUnit || "",
          costOfUnit: Number(doc.data().costOfUnit) || 0,
          purchUnitQty: Number(doc.data().purchUnitQty) || 0,
          date: doc.data().date,
        }));
        setRawGoodsList(rawGoods);

        // Fetch Suppliers
        const supplierRef = collection(db, "suppliers");
        const supplierSnapshot = await getDocs(
          query(supplierRef, where("userId", "==", auth.currentUser.uid))
        );
        const supplierNames = supplierSnapshot.docs.map(
          (doc) => doc.data().name || ""
        );
        setSupplierList(supplierNames);
      } catch (error) {
        console.error("Error setting up listeners: ", error);
        setError("An error occurred while fetching data. Please try again.");
        setLoading(false);
      }
    };

    if (userLoggedIn) {
      fetchData();
    }

    resetFilters();

    return () => {
      if (unsubscribePurchaseOrders) {
        unsubscribePurchaseOrders();
      }
    };
  }, [userLoggedIn]);

  // Handle changes in the product form
  const handleProductInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;

    if (name === "product" && value) {
      if (checkDuplicateProduct(value) && !editingPurchaseOrderId) {
        setProductError("This product is already added to the current order");
        return;
      } else {
        setProductError("");
      }
    }

    if (
      name === "quantity" ||
      name === "costOfUnit" ||
      name === "purchUnitQty"
    ) {
      if (isNaN(Number(value))) {
        setInputErrors({
          ...inputErrors,
          [name]: "Please enter a valid number",
        });
      } else {
        setInputErrors({ ...inputErrors, [name]: "" });
      }

      const newValues = {
        ...currentProduct,
        [name]: Number(value),
      };

      if (name === "quantity" || name === "costOfUnit") {
        const quantity =
          name === "quantity" ? Number(value) : Number(currentProduct.quantity);
        const costOfUnit =
          name === "costOfUnit"
            ? Number(value)
            : Number(currentProduct.costOfUnit);
        newValues.totalCost = quantity * costOfUnit;
      }

      setCurrentProduct(newValues);
      return;
    }

    setCurrentProduct((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Add or Update a product in the temporary products list
  const handleAddOrUpdateProduct = () => {
    const purchUnitQty = Number(currentProduct.purchUnitQty);
    const adjustedPurchUnitQty = convertToBaseUnit(
      purchUnitQty,
      currentProduct.unitOfMeasure
    );

    // Calculate costOfUnitOfMeasure for the current purchase
    const costOfUnitOfMeasure =
      adjustedPurchUnitQty !== 0
        ? Number(currentProduct.costOfUnit) / adjustedPurchUnitQty
        : 0;

    const newProduct: TempProduct = {
      ...currentProduct,
      quantity: Number(currentProduct.quantity) || 0,
      costOfUnit: Number(currentProduct.costOfUnit) || 0,
      purchUnitQty: purchUnitQty,
      totalCost:
        Number(currentProduct.quantity || 0) * Number(currentProduct.costOfUnit || 0),
      costOfUnitOfMeasure: costOfUnitOfMeasure,
    };

    if (editingPurchaseOrderId) {
      // Update existing purchase order
      setTempProducts((prev) =>
        prev.map((product) =>
          // Find the product being edited
          purchaseOrderList.find((po) => po.id === editingPurchaseOrderId)?.product === product.product
            ? newProduct
            : product
        )
      );
      setEditingPurchaseOrderId(null);
    } else {
      // Add new product
      setTempProducts((prev) => [...prev, newProduct]);
    }

    setCurrentProduct(initialProduct);
    setShowProductForm(false);
  };

  // Update raw goods inventory based on the submitted purchase orders
  const updateRawGoodsInventory = async (products: TempProduct[]) => {
    try {
      for (const product of products) {
        const rawGood = rawGoodsList.find((rg) => rg.name === product.product);
        if (!rawGood) {
          console.error("Raw good not found");
          continue; // Skip if raw good not found
        }

        const adjustedPurchUnitQty = convertToBaseUnit(
          Number(product.purchUnitQty),
          product.unitOfMeasure
        );

        const newPurchaseQuantity =
          Number(product.quantity) * adjustedPurchUnitQty;
        const currentQuantity = Number(rawGood.qtyOnHand);

        // Calculate new average cost
        const currentTotalValue =
          currentQuantity * Number(rawGood.averageCostOfUnitOfMeasure);
        const newPurchaseValue =
          newPurchaseQuantity * Number(product.costOfUnitOfMeasure);
        const totalQuantity = currentQuantity + newPurchaseQuantity;
        const newAverageCost =
          totalQuantity !== 0
            ? (currentTotalValue + newPurchaseValue) / totalQuantity
            : 0;

        const rawGoodRef = doc(db, "rawGoods", rawGood.id);
        await updateDoc(rawGoodRef, {
          qtyOnHand: totalQuantity,
          averageCostOfUnitOfMeasure: newAverageCost,
          lastCostOfUnitOfMeasure: product.costOfUnitOfMeasure,
          date: Timestamp.now(), // Add timestamp for date tracking
        });

        // Update the rawGoodsList state
        setRawGoodsList((prevRawGoodsList) =>
          prevRawGoodsList.map((rg) =>
            rg.id === rawGood.id
              ? {
                  ...rg,
                  qtyOnHand: totalQuantity,
                  averageCostOfUnitOfMeasure: newAverageCost,
                  lastCostOfUnitOfMeasure: product.costOfUnitOfMeasure,
                  date: Timestamp.now(),
                }
              : rg
          )
        );
      }
    } catch (error) {
      console.error("Error updating raw good:", error);
      throw error;
    }
  };

  // Handle form submission to add or update purchase orders
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || tempProducts.length === 0) return;

    try {
      console.log("Submitting Purchase Orders:", tempProducts);
      // Add or Update each product in the purchase order
      for (const product of tempProducts) {
        const purchaseOrderData = {
          ...purchaseOrderHeader,
          ...product,
          quantity: Number(product.quantity),
          costOfUnit: Number(product.costOfUnit),
          purchUnitQty: Number(product.purchUnitQty),
          totalCost: Number(product.totalCost),
          costOfUnitOfMeasure: Number(product.costOfUnitOfMeasure),
          date: Timestamp.fromDate(new Date(purchaseOrderHeader.date)), // Store as Timestamp
          userId: auth.currentUser.uid,
        };

        if (editingPurchaseOrderId) {
          // Update existing purchase order
          const purchaseOrderRef = doc(db, "purchaseOrders", editingPurchaseOrderId);
          await updateDoc(purchaseOrderRef, purchaseOrderData);
        } else {
          // Add new purchase order
          await addDoc(collection(db, "purchaseOrders"), purchaseOrderData);
        }
      }

      // Update raw goods inventory for all products
      await updateRawGoodsInventory(tempProducts);

      // Reset form
      setPurchaseOrderHeader(initialPurchaseOrderHeader);
      setTempProducts([]);
      setShowProductForm(false);
      setCurrentProduct(initialProduct);
      setProductError("");
      setEditingPurchaseOrderId(null);
      resetFilters();
    } catch (error) {
      console.error("Error adding/updating purchase orders:", error);
      setError("Failed to save purchase orders. Please try again.");
    }
  };

  // Remove a product from the temporary products list
  const removeProduct = (index: number) => {
    setTempProducts((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculate the total cost of the current order
  const calculateTotalOrderCost = () => {
    return tempProducts.reduce(
      (sum, product) => sum + (Number(product.totalCost) || 0),
      0
    );
  };

  // Handle editing of a purchase order
  const handleEdit = (purchaseOrder: PurchaseOrder) => {
    setCurrentProduct({
      product: purchaseOrder.product,
      quantity: purchaseOrder.quantity,
      costOfUnit: purchaseOrder.costOfUnit,
      purchUnitQty: purchaseOrder.purchUnitQty,
      unitOfMeasure: purchaseOrder.unitOfMeasure,
      purchaseUnit: purchaseOrder.purchaseUnit,
      totalCost: purchaseOrder.totalCost,
      costOfUnitOfMeasure: purchaseOrder.costOfUnitOfMeasure,
    });
    setPurchaseOrderHeader({
      date: dayjs(purchaseOrder.date, "MM/DD/YYYY").format("YYYY-MM-DD"),
      supplier: purchaseOrder.supplier,
      invoiceNumber: purchaseOrder.invoiceNumber,
    });
    setEditingPurchaseOrderId(purchaseOrder.id);
    setShowProductForm(true);
    setProductError("");
  };

  // Handle deletion of a purchase order
  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, "purchaseOrders", id));
    } catch (error) {
      console.error("Error deleting purchase order: ", error);
      setError("Failed to delete purchase order. Please try again.");
    }
  };

  // Get unit suffix based on unit of measure
  const getUnitSuffix = (unitOfMeasure: string): string => {
    switch (unitOfMeasure) {
      case "Grams":
        return "gr";
      case "Kilograms":
        return "kg";
      case "Milliliters":
        return "ml";
      case "Litre":
        return "lt";
      case "Count":
        return "cnt";
      default:
        return "";
    }
  };

  // Download the purchase orders list as a PDF
  const downloadPurchaseOrdersList = () => {
    try {
      const doc = new jsPDF();

      doc.setFontSize(18);
      doc.text("Purchase Orders List", 14, 22);

      doc.setFontSize(12);
      doc.text(restaurantName, 14, 32);
      doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 38);

      const tableBody = filteredPurchaseOrderList.map((order, index) => [
        index + 1,
        order.date || "",
        order.invoiceNumber || "",
        order.product || "",
        order.supplier || "",
        `${order.quantity || 0} ${order.purchaseUnit || ""}`,
        `€ ${(Number(order.costOfUnit) || 0).toFixed(2)}`,
        `€ ${(Number(order.costOfUnitOfMeasure) || 0).toFixed(4)}`,
        `${order.purchUnitQty} ${getUnitSuffix(order.unitOfMeasure || "")}`,
        order.purchaseUnit || "",
        `€ ${(Number(order.totalCost) || 0).toFixed(2)}`,
      ]);

      doc.autoTable({
        head: [
          [
            "Order ID",
            "Date",
            "Invoice #",
            "Raw Good",
            "Supplier",
            "Quantity",
            "Cost (Unit)",
            "Cost (Unit of Measure)",
            "Purch. Unit Qty",
            "Purchase Unit",
            "Total Cost",
          ],
        ],
        body: tableBody,
        startY: 45,
      });

      doc.save("purchase_orders_list.pdf");
    } catch (error) {
      console.error("Error generating PDF:", error);
      setError("Failed to generate PDF. Please try again.");
    }
  };

  // Toggle the visibility of filter popups
  const toggleFilterPopup = (key: string) => {
    setFilterPopupVisible((prev) => {
      if (prev[key] && filterTimers.current[key]) {
        clearTimeout(filterTimers.current[key]);
      }
      return {
        ...prev,
        [key]: !prev[key],
      };
    });

    if (!filterPopupVisible[key]) {
      filterTimers.current[key] = setTimeout(() => {
        setFilterPopupVisible((prev) => ({
          ...prev,
          [key]: false,
        }));
      }, 3000);
    }
  };

  // Handle changes in filter options
  const handleFilterChange = (key: string, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
    setFilterPopupVisible((prev) => ({
      ...prev,
      [key]: false,
    }));
    if (filterTimers.current[key]) {
      clearTimeout(filterTimers.current[key]);
    }
  };

  // Apply sorting based on column
  const applySorting = (key: string, direction: "ascending" | "descending") => {
    setSortConfig({ key, direction });
    setFilterPopupVisible((prev) => ({
      ...prev,
      [key]: false,
    }));
    if (filterTimers.current[key]) {
      clearTimeout(filterTimers.current[key]);
    }
  };

  // Handle changes in the date range filter
  const handleDateRangeChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "start" | "end"
  ) => {
    const value = e.target.value;
    const updatedDateRange = { ...dateRange, [type]: value };
    setDateRange(updatedDateRange);
    setFilters((prev) => ({
      ...prev,
      dateRange: updatedDateRange,
    }));

    if (updatedDateRange.start && updatedDateRange.end) {
      setFilterPopupVisible((prev) => ({
        ...prev,
        date: false,
      }));
      if (filterTimers.current["date"]) {
        clearTimeout(filterTimers.current["date"]);
      }
    }
  };

  // Reset all filters
  const resetFilters = () => {
    setFilters({});
    setDateRange({ start: "", end: "" });
    setSortConfig(null);
  };

  // Get unique values for filtering
  const getUniqueValues = (key: string) => {
    return Array.from(new Set(purchaseOrderList.map((order) => order[key])));
  };

  // Filter and sort the purchase orders list
  const filteredPurchaseOrderList = purchaseOrderList
    .filter((order) => {
      let isVisible = true;

      // Date Range Filter
      if (filters.dateRange && filters.dateRange.start && filters.dateRange.end) {
        isVisible =
          isVisible &&
          dayjs(order.date, "MM/DD/YYYY").isAfter(dayjs(filters.dateRange.start).subtract(1, "day")) &&
          dayjs(order.date, "MM/DD/YYYY").isBefore(dayjs(filters.dateRange.end).add(1, "day"));
      }

      // Other Filters
      Object.keys(filters).forEach((key) => {
        if (key !== "dateRange" && filters[key]) {
          if (typeof filters[key] === "string") {
            isVisible =
              isVisible &&
              order[key]?.toString().toLowerCase() ===
                filters[key].toString().toLowerCase();
          }
        }
      });

      return isVisible;
    })
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;
      const aValue = a[key];
      const bValue = b[key];
      if (aValue < bValue) {
        return direction === "ascending" ? -1 : 1;
      }
      if (aValue > bValue) {
        return direction === "ascending" ? 1 : -1;
      }
      return 0;
    });

  // Check if a filter is active
  const isFilterActive = (key: string) => {
    if (key === "date") {
      return filters.dateRange && (filters.dateRange.start || filters.dateRange.end);
    }
    return filters[key];
  };

  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="container mx-auto p-8">
        {userLoggedIn === false ? (
          <p className="text-red-500">
            Please log in to view and manage purchase orders.
          </p>
        ) : (
          <>
            {/* New Purchase Order Form */}
            <div className="max-w-4xl mx-auto">
              <div className="bg-blue-500 rounded-lg shadow-lg p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4 text-white">
                  {editingPurchaseOrderId ? "Update Purchase Order" : "New Purchase Order"}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Purchase Order Header */}
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <label
                        htmlFor="date"
                        className="block text-sm font-medium text-white mb-1"
                      >
                        Date
                      </label>
                      <input
                        type="date"
                        name="date"
                        id="date"
                        value={purchaseOrderHeader.date}
                        onChange={handleHeaderChange}
                        className="w-full p-2 border rounded text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="invoiceNumber"
                        className="block text-sm font-medium text-white mb-1"
                      >
                        Invoice Number
                      </label>
                      <input
                        type="text"
                        name="invoiceNumber"
                        id="invoiceNumber"
                        value={purchaseOrderHeader.invoiceNumber}
                        onChange={handleHeaderChange}
                        placeholder="Invoice Number"
                        className="w-full p-2 border rounded text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="supplier"
                        className="block text-sm font-medium text-white mb-1"
                      >
                        Supplier
                      </label>
                      <select
                        name="supplier"
                        id="supplier"
                        value={purchaseOrderHeader.supplier}
                        onChange={handleHeaderChange}
                        className="w-full p-2 border rounded text-sm"
                        required
                      >
                        <option value="">Select Supplier</option>
                        {supplierList.map((supplier, index) => (
                          <option key={index} value={supplier}>
                            {supplier}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Add or Update Product Button */}
                  {canAddProduct() && !showProductForm && (
                    <button
                      type="button"
                      onClick={() => setShowProductForm(true)}
                      className="bg-white text-blue-500 px-4 py-2 rounded hover:bg-blue-100 flex items-center"
                    >
                      <Plus size={20} className="mr-2" />
                      Add Product
                    </button>
                  )}

                  {/* Product Form */}
                  {showProductForm && (
                    <div className="bg-white p-4 rounded-lg mt-4">
                      <h3 className="text-lg font-semibold mb-4 text-gray-800">
                        {editingPurchaseOrderId ? "Update Product" : "Add Product Details"}
                      </h3>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <label
                            htmlFor="product"
                            className="block text-sm font-medium text-gray-700 mb-1"
                          >
                            Product
                          </label>
                          <select
                            name="product"
                            id="product"
                            value={currentProduct.product}
                            onChange={handleProductInputChange}
                            className={`w-full p-2 border rounded text-sm ${
                              productError ? "border-red-500" : ""
                            }`}
                            required
                          >
                            <option value="">Select Raw Good</option>
                            {rawGoodsList.map((product) => (
                              <option key={product.id} value={product.name}>
                                {product.name}
                              </option>
                            ))}
                          </select>
                          {productError && (
                            <p className="text-red-500 text-xs mt-1">
                              {productError}
                            </p>
                          )}
                        </div>
                        <div>
                          <label
                            htmlFor="unitOfMeasure"
                            className="block text-sm font-medium text-gray-700 mb-1"
                          >
                            Unit of Measure
                          </label>
                          <select
                            name="unitOfMeasure"
                            id="unitOfMeasure"
                            value={currentProduct.unitOfMeasure}
                            onChange={handleProductInputChange}
                            className="w-full p-2 border rounded text-sm"
                            required
                          >
                            <option value="">Select Unit of Measure</option>
                            <option value="Grams">Grams</option>
                            <option value="Kilograms">Kilograms</option>
                            <option value="Milliliters">Milliliters</option>
                            <option value="Litre">Litre</option>
                            <option value="Count">Count</option>
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="purchaseUnit"
                            className="block text-sm font-medium text-gray-700 mb-1"
                          >
                            Purchase Unit
                          </label>
                          <select
                            name="purchaseUnit"
                            id="purchaseUnit"
                            value={currentProduct.purchaseUnit}
                            onChange={handleProductInputChange}
                            className="w-full p-2 border rounded text-sm"
                            required
                          >
                            <option value="">Select Purchase Unit</option>
                            <option value="Bag">Bag</option>
                            <option value="Carton">Carton</option>
                            <option value="Bottle">Bottle</option>
                            <option value="Box">Box</option>
                            <option value="Each">Each</option>
                            <option value="Tub">Tub</option>
                            <option value="Packet">Packet</option>
                            <option value="Stick">Stick</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 mb-4">
                        {/* Quantity Input */}
                        <div>
                          <label
                            htmlFor="quantity"
                            className="block text-sm font-medium text-gray-700 mb-1"
                          >
                            Quantity
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              name="quantity"
                              id="quantity"
                              value={currentProduct.quantity || ""}
                              onChange={handleProductInputChange}
                              className="w-full p-2 border rounded text-sm pr-16"
                              required
                            />
                            {currentProduct.purchaseUnit && (
                              <span className="absolute right-0 top-0 bottom-0 px-2 flex items-center bg-gray-200 rounded-r text-gray-700">
                                {currentProduct.purchaseUnit}
                              </span>
                            )}
                          </div>
                          {inputErrors.quantity && (
                            <p className="text-red-500 text-xs mt-1">
                              {inputErrors.quantity}
                            </p>
                          )}
                        </div>

                        {/* Purchase Unit Quantity Input */}
                        <div>
                          <label
                            htmlFor="purchUnitQty"
                            className="block text-sm font-medium text-gray-700 mb-1"
                          >
                            Purchase Unit Quantity
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              name="purchUnitQty"
                              id="purchUnitQty"
                              value={currentProduct.purchUnitQty || ""}
                              onChange={handleProductInputChange}
                              className="w-full p-2 border rounded text-sm pr-12"
                              required
                            />
                            {currentProduct.unitOfMeasure && (
                              <span className="absolute right-0 top-0 bottom-0 px-2 flex items-center bg-gray-200 rounded-r text-gray-700">
                                {getUnitSuffix(currentProduct.unitOfMeasure)}
                              </span>
                            )}
                          </div>
                          {inputErrors.purchUnitQty && (
                            <p className="text-red-500 text-xs mt-1">
                              {inputErrors.purchUnitQty}
                            </p>
                          )}
                        </div>

                        {/* Cost (Unit) Input */}
                        <div>
                          <label
                            htmlFor="costOfUnit"
                            className="block text-sm font-medium text-gray-700 mb-1"
                          >
                            Cost (Unit)
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              name="costOfUnit"
                              id="costOfUnit"
                              value={currentProduct.costOfUnit || ""}
                              onChange={handleProductInputChange}
                              className="w-full p-2 border rounded text-sm pr-8"
                              required
                            />
                            <span className="absolute right-0 top-0 bottom-0 px-2 flex items-center bg-gray-200 rounded-r text-gray-700">
                              €
                            </span>
                          </div>
                          {inputErrors.costOfUnit && (
                            <p className="text-red-500 text-xs mt-1">
                              {inputErrors.costOfUnit}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowProductForm(false);
                            setEditingPurchaseOrderId(null);
                            setCurrentProduct(initialProduct);
                            setProductError("");
                          }}
                          className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleAddOrUpdateProduct}
                          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                        >
                          {editingPurchaseOrderId ? "Update Product" : "Add Product"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Temporary Products List */}
                  {tempProducts.length > 0 && (
                    <div className="mt-4 bg-white rounded-lg p-4">
                      <h3 className="text-lg font-semibold mb-2">
                        Products in Current Order
                      </h3>
                      <table className="min-w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left" style={{ width: "30%" }}>
                              Product
                            </th>
                            <th className="px-4 py-2 text-center" style={{ width: "20%" }}>
                              Quantity
                            </th>
                            <th className="px-4 py-2 text-center" style={{ width: "20%" }}>
                              Unit Cost
                            </th>
                            <th className="px-4 py-2 text-center" style={{ width: "20%" }}>
                              Total Cost
                            </th>
                            <th className="px-4 py-2 text-center" style={{ width: "10%" }}>
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {tempProducts.map((product, index) => (
                            <tr key={index}>
                              <td className="px-4 py-2 text-left">
                                {product.product}
                              </td>
                              <td className="px-4 py-2 text-center">
                                {product.quantity} {product.purchaseUnit}
                              </td>
                              <td className="px-4 py-2 text-center">
                                €{(Number(product.costOfUnit) || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-center">
                                €{(Number(product.totalCost) || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-2 text-center">
                                <button
                                  onClick={() => handleEdit(purchaseOrderList[index])}
                                  className="text-blue-500 hover:text-blue-700 mr-2"
                                  title="Edit"
                                >
                                  <Edit2 size={18} />
                                </button>
                                <button
                                  onClick={() => removeProduct(index)}
                                  className="text-red-500 hover:text-red-700"
                                  title="Delete"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-gray-50 font-semibold">
                            <td colSpan={3} className="px-4 py-2 text-right">
                              Total Order Cost:
                            </td>
                            <td className="px-4 py-2 text-center">
                              €{calculateTotalOrderCost().toFixed(2)}
                            </td>
                            <td></td>
                          </tr>
                        </tbody>
                      </table>

                      <button
                        type="submit"
                        className="mt-4 bg-green-500 text-white px-6 py-2 rounded hover:bg-green-600"
                      >
                        {editingPurchaseOrderId ? "Update Purchase Order" : "Submit Purchase Order"}
                      </button>
                    </div>
                  )}
                </form>
              </div>
            </div>

            {/* Existing Purchase Orders List */}
            <div className="bg-white bg-opacity-80 rounded-lg shadow-lg p-6 mb-4 overflow-x-auto">
              <h2 className="text-2xl font-semibold mb-4">
                Purchase Orders List
              </h2>
              {loading ? (
                <p>Loading purchase orders...</p>
              ) : error ? (
                <p className="text-red-500">{error}</p>
              ) : !purchaseOrderList?.length ? (
                <p>No purchase orders found. Add your first purchase order above.</p>
              ) : (
                <>
                  <table className="min-w-full bg-white">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="py-2 px-4 border-b text-center">
                          Order ID
                        </th>
                        {[
                          { key: "date", label: "Date" },
                          { key: "invoiceNumber", label: "Invoice #" },
                          { key: "product", label: "Raw Good" },
                          { key: "supplier", label: "Supplier" },
                          { key: "quantity", label: "Quantity" },
                          { key: "costOfUnit", label: "Cost (Unit)" },
                          {
                            key: "costOfUnitOfMeasure",
                            label: "Cost (Unit of Measure)",
                          },
                          { key: "purchUnitQty", label: "Purch. Unit Qty" },
                          { key: "purchaseUnit", label: "Purchase Unit" },
                          { key: "totalCost", label: "Total Cost" },
                        ].map((column) => (
                          <th
                            key={column.key}
                            className="py-2 px-4 border-b text-center relative"
                          >
                            <div className="flex items-center justify-center">
                              {column.label}
                              <button
                                type="button"
                                onClick={() => toggleFilterPopup(column.key)}
                                className={`ml-2 hover:text-gray-800 ${
                                  isFilterActive(column.key)
                                    ? "text-red-500"
                                    : "text-gray-600"
                                }`}
                              >
                                <Filter size={16} />
                              </button>
                            </div>
                            {filterPopupVisible[column.key] && (
                              <div className="absolute bg-white border rounded shadow p-2 mt-2 z-10">
                                {column.key === "date" ? (
                                  <div>
                                    <label className="block text-sm mb-1">
                                      Start Date:
                                    </label>
                                    <input
                                      type="date"
                                      value={dateRange.start}
                                      onChange={(e) =>
                                        handleDateRangeChange(e, "start")
                                      }
                                      className="w-full p-1 border rounded mb-2 text-sm"
                                    />
                                    <label className="block text-sm mb-1">
                                      End Date:
                                    </label>
                                    <input
                                      type="date"
                                      value={dateRange.end}
                                      onChange={(e) =>
                                        handleDateRangeChange(e, "end")
                                      }
                                      className="w-full p-1 border rounded mb-2 text-sm"
                                    />
                                  </div>
                                ) : ["quantity", "costOfUnit", "costOfUnitOfMeasure", "purchUnitQty", "totalCost"].includes(
                                    column.key
                                  ) ? (
                                  <div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        applySorting(column.key, "ascending")
                                      }
                                      className="block w-full text-left px-2 py-1 text-sm hover:bg-gray-100"
                                    >
                                      Sort Ascending
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        applySorting(column.key, "descending")
                                      }
                                      className="block w-full text-left px-2 py-1 text-sm hover:bg-gray-100"
                                    >
                                      Sort Descending
                                    </button>
                                  </div>
                                ) : (
                                  <div>
                                    {getUniqueValues(column.key).map(
                                      (value, idx) => (
                                        <div
                                          key={idx}
                                          className="flex items-center mb-1"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={filters[column.key] === value}
                                            onChange={() =>
                                              handleFilterChange(column.key, value)
                                            }
                                            className="mr-2"
                                          />
                                          <label className="text-sm">
                                            {value}
                                          </label>
                                        </div>
                                      )
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </th>
                        ))}
                        <th className="py-2 px-4 border-b text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPurchaseOrderList.map((order, index) => (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="py-2 px-4 border-b text-center">
                            {index + 1}
                          </td>
                          <td className="py-2 px-4 border-b text-center">
                            {order.date}
                          </td>
                          <td className="py-2 px-4 border-b text-center">
                            {order.invoiceNumber}
                          </td>
                          <td className="py-2 px-4 border-b text-center">
                            {order.product}
                          </td>
                          <td className="py-2 px-4 border-b text-center">
                            {order.supplier}
                          </td>
                          <td className="py-2 px-4 border-b text-center">
                            {order.quantity}
                            <span className="text-gray-600 ml-1">
                              {order.purchaseUnit}
                            </span>
                          </td>
                          <td className="py-2 px-4 border-b text-center">
                            €{(Number(order.costOfUnit) || 0).toFixed(2)}
                          </td>
                          <td className="py-2 px-4 border-b text-center">
                            €{(Number(order.costOfUnitOfMeasure) || 0).toFixed(4)}
                          </td>
                          <td className="py-2 px-4 border-b text-center">
                            {order.purchUnitQty}
                            <span className="text-gray-600 ml-1">
                              {getUnitSuffix(order.unitOfMeasure)}
                            </span>
                          </td>
                          <td className="py-2 px-4 border-b text-center">
                            {order.purchaseUnit}
                          </td>
                          <td className="py-2 px-4 border-b text-center">
                            €{(Number(order.totalCost) || 0).toFixed(2)}
                          </td>
                          <td className="py-2 px-4 border-b text-center">
                            <button
                              onClick={() => handleEdit(order)}
                              className="text-blue-500 hover:text-blue-700 mr-2"
                              title="Edit"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button
                              onClick={() => handleDelete(order.id)}
                              className="text-red-500 hover:text-red-700"
                              title="Delete"
                            >
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {purchaseOrderList?.length > 0 && (
                    <>
                      <div className="mt-4 flex space-x-2">
                        <button
                          onClick={resetFilters}
                          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 flex items-center"
                        >
                          Reset Filters
                        </button>
                        <button
                          onClick={downloadPurchaseOrdersList}
                          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 flex items-center"
                        >
                          <Download size={18} className="mr-2" />
                          Download Purchase Orders List (PDF)
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default PurchaseOrders;
