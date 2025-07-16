# SCOPE 大数据平台测试数据文件说明

## 概述

本文件夹包含SCOPE大数据平台的完整执行环境文件，用于分析和优化SCOPE脚本的性能。文件夹分为两个版本：

1. **精简版**：`[cosmos14.osdinfra.net_office.adhoc.corp]d50cb756-f91f-4a12-bd46-b9e4f4124a9a/` - 运行后本地生成的核心文件
2. **完整版**：`TenantToLansubnetPairProbability_20250228_140626/` - 从云端下载的完整执行环境

## SCOPE平台执行流程

### 1. 脚本编写阶段
- **输入文件**：`scope.script`
  - 用户编写的SCOPE查询脚本，包含业务逻辑、数据源、转换逻辑和输出格式
  - 支持C#代码嵌入（`#CS` 块）
  - 可添加隐私注解和数据处理规则

> 说明：`request.script` 是由编译器自动生成的中间文件，会将C#代码拆分出来，用户无法直接控制或修改。该文件仅供大数据引擎内部使用，对性能优化无实际帮助。

### 2. 编译优化阶段
- **编译输出**：`__ScopeCodeGenCompileOutput__.txt`
  ```
  编译过程记录:
  ├── C#编译阶段
  │   ├── 编译时间统计
  │   ├── 函数数量统计
  │   └── 关键指标: csharpCompileTime, functionCount
  ├── C++编译阶段
  │   ├── 预编译头文件生成
  │   ├── 代码生成统计
  │   └── 关键指标: cppCompileTime, codeGenerationTime
  └── 编译警告和错误
  ```

- **执行计划**：`ScopeVertexDef.xml`
  ```
  <ScopeVertices>
    ├── <ScopeVertex id="SV1_Extract">
    │   ├── <EstimatedLimitMemory>  # 内存限制估算
    │   ├── <EstimatedOptimalMemory> # 最优内存配置
    │   └── <operator>               # 算子定义
    │       ├── id, uid, assemblyName, className
    │       ├── <input>              # 输入数据流
    │       └── <output>             # 输出数据流
    └── 关键指标: vertexCount, operatorCount, memoryEstimate
  ```

### 3. 运行时执行阶段
- **运行时统计**：`__ScopeRuntimeStatistics__.xml`
  - 详细的性能监控数据
  - 内存使用情况（峰值、平均值）
  - CPU时间分布（用户态、内核态）
  - I/O操作统计（读取、写入、压缩）
  - 异常计数和GC信息

- **作业信息**：`JobInfo.xml`
  - 作业执行状态和生命周期
  - 资源分配和调度信息
  - 执行时间和性能指标
  - 集群和节点信息

### 4. 诊断分析阶段
- **警告信息**：`__Warnings__.xml`
  ```
  <Warnings>
    ├── <Warning id="132The operation 'LIST' is potentially non-deterministic.">
    │   ├── location: 警告位置
    │   ├── severity: 严重程度
    │   ├── occurrences: 出现次数
    │   ├── message: 警告消息
    │   └── solution: 解决方案
    └── 关键指标: warningCount, severity, location
  ```

- **诊断信息**：`__ScopeDiagnosisInfo__.xml`
  ```
  <OperatorPhyMapping>
    ├── <Mapping OperatorId="PartialAggregate_3" PhyPlanGroupNo="105.39" />
    └── 关键指标: operatorMapping, planGroupNo
  ```

## 核心文件详解

### 脚本文件
```
scope.script / request.script
├── 业务逻辑定义
│   ├── #DECLARE 变量声明
│   ├── USING 命名空间引用
│   └── 关键指标: variableCount, namespaceCount
├── 数据源配置
│   ├── SSTREAM 流数据源
│   ├── EXTRACT 文件数据源
│   └── 关键指标: dataSourceCount, dataSize
├── 数据转换
│   ├── SELECT 字段映射
│   ├── JOIN 数据连接
│   ├── GROUP BY 数据聚合
│   └── 关键指标: transformCount, joinCount
├── 用户定义函数
│   ├── #CS C#代码块
│   ├── 自定义函数实现
│   └── 关键指标: functionCount, codeLines
└── 输出配置
    ├── OUTPUT 输出语句
    ├── 输出格式配置
    └── 关键指标: outputCount, formatType
```

### 编译产物
```
__ScopeCodeGen__.dll.cs          # 生成的C#代码
├── 用户定义函数实现
├── 数据转换逻辑
└── 关键指标: functionCount, codeSize

__ScopeCodeGenEngine__.dll.cpp   # 生成的C++代码
├── 本地执行引擎
├── 内存管理代码
└── 关键指标: functionCount, compilationTime

__ScopeCodeGen__.dll             # 编译后的托管程序集
├── .NET程序集文件
└── 关键指标: assemblySize, version

__ScopeCodeGenEngine__.dll       # 编译后的本地程序集
├── 本地DLL文件
└── 关键指标: dllSize, dependencies
```

### 执行环境
```
scopeengine.dll                  # SCOPE引擎核心
├── 本地执行引擎
├── 内存管理模块
└── 关键指标: engineVersion, engineSize

scopehost.exe                    # 作业主机程序
├── 作业调度器
├── 资源管理器
└── 关键指标: hostVersion, processId

microsoft.scope.*.dll           # SCOPE运行时库
├── 运行时接口
├── 数据类型定义
└── 关键指标: runtimeVersion, assemblyCount

microsoft.cosmos.*.dll          # Cosmos存储库
├── 存储访问接口
├── 数据序列化
└── 关键指标: cosmosVersion, storageType
```

### 性能监控文件

#### 运行时统计
```
__ScopeRuntimeStatistics__.xml
├── <AggregatedStats>
│   ├── <SV1_Extract>  # 每个ScopeVertex的统计
│   │   ├── avgExecutionMemoryPeakSize, maxExecutionMemoryPeakSize
│   │   ├── avgOverallMemoryPeakSize, maxOverallMemoryPeakSize
│   │   ├── inclusiveTime, elapsedTime, executeElapsedTime
│   │   ├── executeTotalCpuTime, executeUserCpuTime, executeKernelCpuTime
│   │   ├── <ExceptionCounts>  # csharpExceptionCount, cppExceptionCount, otherExceptionCount
│   │   ├── <InputStatistics>  # totalBytes, totalCompressedBytes, totalDecompressedBytes
│   │   ├── <OutputStatistics> # totalBytes, totalCompressedBytes, tempBytes
│   │   ├── <ManagedMemory>    # avgGen0CollectionsCount, avgTimeInGCPercent, avgManagedMemoryPeakSize
│   │   └── <Time>             # elapsedTime, executeElapsedTime, totalCpuTime
│   └── <Output>               # bytes, rowCount, operations, totalIoTime
└── 关键指标: memoryPeakSize, cpuTime, ioTime, exceptionCount, gcStats
```

#### 作业信息
```
JobInfo.xml
├── <JobInfo>
│   ├── Id, Name, State, RuntimeState
│   ├── StartTime, EndTime, SubmitTime, RunTime
│   ├── UserName, Priority, VirtualCluster
│   ├── <JobResourceNames>     # 资源文件列表
│   ├── CompilationTimeTicks, QueuedTimeTicks, RunTimeTicks
│   ├── VcPercentAllocation, Cluster, RuntimeName
│   └── <StateAuditRecords>    # 状态变更历史
└── 关键指标: runTime, compilationTime, queuedTime, state, resources
```

#### 系统性能
```
profile_system                   # 系统级性能数据
├── CPU使用率统计
├── 内存使用情况
├── 网络I/O统计
└── 关键指标: cpuUsage, memoryUsage, networkIO

profile                          # 进程级性能数据
├── 进程资源使用
├── 进程间通信
└── 关键指标: processMemory, processCpu, interProcessComm
```

#### 内部统计
```
ScopeInternalStatistics.xml
├── SCOPE引擎内部指标
├── 算子执行详情
└── 关键指标: engineStats, operatorDetails
```

## 数据流分析

### 典型SCOPE作业数据流
1. **数据提取**：从SSTREAM或文件读取原始数据
2. **数据过滤**：应用WHERE条件过滤无效数据
3. **数据转换**：使用SELECT进行字段映射和计算
4. **数据聚合**：通过GROUP BY进行分组统计
5. **数据连接**：使用JOIN合并多个数据源
6. **数据输出**：将结果写入目标存储

### 性能关键点
- **内存使用**：每个算子都有内存限制和最优配置
- **I/O效率**：数据压缩、缓存策略影响性能
- **并行度**：分区策略决定并行执行能力
- **网络传输**：节点间数据传输开销

## 文件结构说明

### XML文件结构
```
通用XML结构:
├── 根元素 (Root Element)
│   ├── 属性 (Attributes) - 元数据信息
│   ├── 子元素 (Child Elements) - 数据内容
│   └── 文本内容 (Text Content) - 具体数值
└── 命名空间 (Namespaces) - 版本兼容性
```

### 关键数据定位
```
性能数据路径:
├── __ScopeRuntimeStatistics__.xml
│   ├── /AggregatedStats/SV*/avgExecutionMemoryPeakSize
│   ├── /AggregatedStats/SV*/Time/executeElapsedTime
│   ├── /AggregatedStats/SV*/ExceptionCounts/csharpExceptionCount
│   └── /AggregatedStats/SV*/ManagedMemory/avgGen0CollectionsCount
├── JobInfo.xml
│   ├── /JobInfo/RunTime
│   ├── /JobInfo/CompilationTimeTicks
│   └── /JobInfo/StateAuditRecords/DisplayedStateAuditRecord
└── ScopeVertexDef.xml
    ├── /ScopeVertices/ScopeVertex/EstimatedLimitMemory
    └── /ScopeVertices/ScopeVertex/operator
```

## 开发工具集成

### 🔧 **VS Code扩展支持**
- **语法高亮**：SCOPE脚本语法支持
- **智能提示**：函数和字段自动补全
- **错误检查**：编译时错误和警告显示
- **性能分析**：集成运行时统计查看

### 🐛 **调试功能**
- **执行计划可视化**：DAG图展示
- **性能瓶颈识别**：基于统计数据的分析
- **内存使用分析**：内存泄漏和优化建议
- **I/O性能分析**：读写性能优化建议

### 工具开发参考

#### 数据解析接口
```
文件解析接口:
├── XML文件解析
│   ├── XPath查询支持
│   ├── 属性提取
│   └── 关键指标: xpathQuery, attributeExtraction
├── 文本文件解析
│   ├── 正则表达式匹配
│   ├── 行级解析
│   └── 关键指标: regexPattern, lineParsing
└── 二进制文件解析
    ├── 结构体解析
    ├── 内存映射
    └── 关键指标: structDefinition, memoryMapping
```

#### 性能指标提取
```
关键指标映射:
├── 内存指标
│   ├── avgExecutionMemoryPeakSize
│   ├── maxOverallMemoryPeakSize
│   └── avgManagedMemoryPeakSize
├── CPU指标
│   ├── executeElapsedTime
│   ├── executeTotalCpuTime
│   └── executeUserCpuTime
├── I/O指标
│   ├── totalBytes
│   ├── totalIoTime
│   └── operations
└── 异常指标
    ├── csharpExceptionCount
    ├── cppExceptionCount
    └── otherExceptionCount
```

## ⚠️ 注意事项

1. **文件大小**：完整版包含大量运行时库，文件较大
2. **版本兼容性**：确保SCOPE引擎版本与脚本兼容
3. **资源限制**：注意内存和CPU使用限制
4. **数据隐私**：确保敏感数据得到适当保护
5. **错误处理**：关注编译警告和运行时异常

## 文件关联关系

### 数据流向
```
作业执行流程:
├── scope.script → __ScopeCodeGenCompileOutput__.txt → 编译产物
├── 编译产物 → ScopeVertexDef.xml → 执行计划
├── 执行计划 → __ScopeRuntimeStatistics__.xml → 运行时统计
├── 运行时统计 → JobInfo.xml → 作业状态
└── 异常信息 → __Warnings__.xml → 警告诊断
```

### 文件依赖关系
```
核心依赖:
├── __ScopeRuntimeStatistics__.xml (独立文件)
├── JobInfo.xml (独立文件)
├── ScopeVertexDef.xml (依赖编译产物)
├── __Warnings__.xml (依赖编译和运行时)
└── __ScopeDiagnosisInfo__.xml (依赖执行计划)
```

## 技术规范

### 文件命名规范
```
SCOPE文件命名:
├── __Scope*__.xml - 运行时生成的核心文件
├── __Scope*__.txt - 编译和诊断文本文件
├── __Scope*__.dll - 编译生成的程序集
├── JobInfo.xml - 作业信息文件
├── ScopeVertexDef.xml - 执行计划文件
└── profile* - 系统性能文件
```

### 数据格式规范
```
XML数据格式:
├── 属性值: 数值型、字符串型、布尔型
├── 时间格式: ISO 8601标准
├── 内存单位: 字节(B)
├── 时间单位: 毫秒(ms)、微秒(μs)
└── 编码格式: UTF-8
```

### 版本兼容性
```
文件版本:
├── SCOPE引擎版本: 影响文件格式兼容性
├── 运行时版本: 影响统计数据结构
├── 编译版本: 影响生成代码格式
└── 集群版本: 影响系统级文件格式
```
