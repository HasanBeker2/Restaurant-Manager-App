import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase';
import Layout from './Layout';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import Select from 'react-select';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

interface DashboardProps {
  logo: string;
  restaurantName: string;
}

interface RawGood {
  id: string;
  name: string;
  qtyOnHand: number;
  unitOfMeasure: string;
}

interface FinishedProduct {
  id: string;
  finishedProductName: string;
  profitPercentagePerItem: number;
}

interface SalesOrder {
  id: string;
  date: string;
  finishedProductName: string;
  finishedProductId: string;
  quantity: number;
  totalPrice: number;
}

const dateRangeOptions = [
  { value: 'lastYear', label: 'Last Year' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'last15Days', label: 'Last 15 Days' },
  { value: 'last7Days', label: 'Last 7 Days' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'today', label: 'Today' },
];

const Dashboard: React.FC<DashboardProps> = ({ logo, restaurantName }) => {
  const [rawGoods, setRawGoods] = useState<RawGood[]>([]);
  const [finishedProducts, setFinishedProducts] = useState<FinishedProduct[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [selectedDateRange, setSelectedDateRange] = useState<{ value: string; label: string } | null>(
    dateRangeOptions[3]
  );
  const [startDate, setStartDate] = useState<Date | null>(
    new Date(new Date().setDate(new Date().getDate() - 7))
  );
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [selectedRawGoods, setSelectedRawGoods] = useState<string[]>([]);
  const [selectedFinishedProducts, setSelectedFinishedProducts] = useState<string[]>([]);

  useEffect(() => {
    fetchData();
  }, [selectedDateRange, startDate, endDate, selectedRawGoods, selectedFinishedProducts]);

  const fetchData = async () => {
    if (!auth.currentUser) return;

    try {
      // Fetch Raw Goods
      const rawGoodsRef = collection(db, 'rawGoods');
      const rawGoodsSnapshot = await getDocs(
        query(rawGoodsRef, where('userId', '==', auth.currentUser.uid))
      );
      const fetchedRawGoods = rawGoodsSnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as RawGood)
      );
      setRawGoods(fetchedRawGoods);

      // Fetch Finished Products
      const finishedProductsRef = collection(db, 'bomAssemblies');
      const finishedProductsSnapshot = await getDocs(
        query(finishedProductsRef, where('userId', '==', auth.currentUser.uid))
      );
      const fetchedFinishedProducts = finishedProductsSnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as FinishedProduct)
      );
      setFinishedProducts(fetchedFinishedProducts);

      // Determine date range
      const { start, end } = getDateRange();

      // Fetch Sales Orders
      const salesOrdersRef = collection(db, 'salesOrders');
      const salesOrdersSnapshot = await getDocs(
        query(
          salesOrdersRef,
          where('userId', '==', auth.currentUser.uid),
          where('date', '>=', start.toISOString().split('T')[0]),
          where('date', '<=', end.toISOString().split('T')[0])
        )
      );
      const fetchedSalesOrders = salesOrdersSnapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as SalesOrder)
      );
      setSalesOrders(fetchedSalesOrders);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const getDateRange = () => {
    if (selectedDateRange) {
      const end = new Date();
      let start = new Date();
      switch (selectedDateRange.value) {
        case 'lastYear':
          start.setFullYear(start.getFullYear() - 1);
          break;
        case 'lastMonth':
          start.setMonth(start.getMonth() - 1);
          break;
        case 'last7Days':
          start.setDate(start.getDate() - 7);
          break;
        case 'yesterday':
          start.setDate(start.getDate() - 1);
          end.setDate(end.getDate() - 1);
          break;
        case 'today':
          // start is already set to today
          break;
        case 'last15Days':
          start.setDate(start.getDate() - 15);
          break;
      }
      return { start, end };
    } else {
      return { start: startDate || new Date(), end: endDate || new Date() };
    }
  };

  const rawGoodOptions = rawGoods.map((good) => ({ value: good.id, label: good.name }));
  const finishedProductOptions = finishedProducts.map((product) => ({
    value: product.id,
    label: product.finishedProductName,
  }));

  const handleDateRangeChange = (selectedOption: any) => {
    setSelectedDateRange(selectedOption);
    setStartDate(null);
    setEndDate(null);
  };

  const handleRawGoodsChange = (selectedOptions: any) => {
    setSelectedRawGoods(selectedOptions.map((option: any) => option.value));
  };

  const handleFinishedProductsChange = (selectedOptions: any) => {
    setSelectedFinishedProducts(selectedOptions.map((option: any) => option.value));
  };

  const filteredRawGoods = rawGoods.filter(
    (good) => selectedRawGoods.length === 0 || selectedRawGoods.includes(good.id)
  );
  const filteredFinishedProducts = finishedProducts.filter(
    (product) => selectedFinishedProducts.length === 0 || selectedFinishedProducts.includes(product.id)
  );

  const COLORS = [
    '#8884d8',
    '#82ca9d',
    '#ffc658',
    '#ff7300',
    '#0088FE',
    '#00C49F',
    '#FFBB28',
    '#FF8042',
  ];

  // Process Raw Goods data for chart
  const processedRawGoods = filteredRawGoods.map((good) => {
    let qty = good.qtyOnHand;
    let unit = '';
    // Assume qtyOnHand is always stored in grams or milliliters
    // Adjust qty and unit based on unitOfMeasure
    if (good.unitOfMeasure === 'Kilograms') {
      qty = qty / 1000; // Convert grams to kilograms
      unit = 'kg';
    } else if (good.unitOfMeasure === 'Grams') {
      unit = 'g';
    } else if (good.unitOfMeasure === 'Liters') {
      qty = qty / 1000; // Convert milliliters to liters
      unit = 'L';
    } else if (good.unitOfMeasure === 'Milliliters') {
      unit = 'ml';
    } else {
      unit = good.unitOfMeasure;
    }
    return { ...good, qtyOnHand: qty, displayUnit: unit };
  });

  // Process Finished Products data for chart
  const processedFinishedProducts = filteredFinishedProducts.map((product) => ({
    ...product,
    profitPercentagePerItem: parseFloat(product.profitPercentagePerItem.toFixed(2)),
  }));

  // Process Sales Orders data for chart
  let salesOverTimeData: any[] = [];
  if (selectedFinishedProducts.length === 1) {
    const selectedProductId = selectedFinishedProducts[0];
    const salesData = salesOrders
      .filter((order) => order.finishedProductId === selectedProductId)
      .map((order) => ({
        date: new Date(order.date).toLocaleDateString(),
        totalPrice: order.totalPrice,
      }));

    // Aggregate sales by date
    const salesByDate: { [key: string]: number } = {};
    salesData.forEach((data) => {
      salesByDate[data.date] = (salesByDate[data.date] || 0) + data.totalPrice;
    });

    salesOverTimeData = Object.entries(salesByDate).map(([date, totalPrice]) => ({
      date,
      totalPrice,
    }));
  }

  return (
    <Layout logo={logo} restaurantName={restaurantName}>
      <div className="flex">
        <div className="w-1/6 bg-gray-100 p-4">
          <h2 className="text-xl font-bold mb-4">Filters</h2>
          <div className="mb-4">
            <label className="block mb-2">Date Range</label>
            <Select
              options={dateRangeOptions}
              value={selectedDateRange}
              onChange={handleDateRangeChange}
              isClearable
            />
          </div>
          <div className="mb-4">
            <label className="block mb-2">Custom Date Range</label>
            <DatePicker
              selected={startDate}
              onChange={(date) => setStartDate(date)}
              selectsStart
              startDate={startDate}
              endDate={endDate}
              className="w-full p-2 border rounded mb-2"
              placeholderText="Start Date"
              disabled={!!selectedDateRange}
            />
            <DatePicker
              selected={endDate}
              onChange={(date) => setEndDate(date)}
              selectsEnd
              startDate={startDate}
              endDate={endDate}
              minDate={startDate}
              className="w-full p-2 border rounded"
              placeholderText="End Date"
              disabled={!!selectedDateRange}
            />
          </div>
          <div className="mb-4">
            <label className="block mb-2">Raw Goods</label>
            <Select isMulti options={rawGoodOptions} onChange={handleRawGoodsChange} />
          </div>
          <div className="mb-4">
            <label className="block mb-2">Finished Products</label>
            <Select isMulti options={finishedProductOptions} onChange={handleFinishedProductsChange} />
          </div>
        </div>
        <div className="w-5/6 p-4">
          <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
          <div className="grid grid-cols-2 gap-4">
            {/* Raw Goods Inventory Chart */}
            <div className="bg-white p-4 rounded-lg shadow">
              <h2 className="text-xl font-bold mb-2">Raw Goods Inventory</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={processedRawGoods}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis
                    tickFormatter={(value) => `${value}`}
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(value: any, name: any, props: any) => {
                      const unit = props.payload.displayUnit;
                      return [`${value.toFixed(1)} ${unit}`, 'Quantity'];
                    }}
                  />
                  <Legend />
                  <Bar dataKey="qtyOnHand">
                    {processedRawGoods.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Finished Products Profit Chart */}
            <div className="bg-white p-4 rounded-lg shadow">
              <h2 className="text-xl font-bold mb-2">Finished Products Profit (%)</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={processedFinishedProducts}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="finishedProductName" />
                  <YAxis
                    tickFormatter={(value) => `${value}%`}
                    allowDecimals={false}
                  />
                  <Tooltip
                    formatter={(value: any) => [`${value}%`, 'Profit']}
                  />
                  <Legend />
                  <Bar dataKey="profitPercentagePerItem">
                    {processedFinishedProducts.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Sales Over Time Chart */}
            <div className="bg-white p-4 rounded-lg shadow col-span-2">
              <h2 className="text-xl font-bold mb-2">Sales of Finished Products Over Time</h2>
              {selectedFinishedProducts.length === 1 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={salesOverTimeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: any) => [`€${value.toFixed(2)}`, 'Total Sales']}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="totalPrice"
                      name="Total Sales"
                      stroke="#8884d8"
                      activeDot={{ r: 8 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p>Please select a single Finished Product to view sales over time.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;
