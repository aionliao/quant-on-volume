基于成交量的股票数据分析系统

# 1. 数据获取

## 1.1. 实验环境搭建

系统及使用的语言：

> Windows 10 专业版 1903 操作系统版本： 18362.356
> 
> Python 3.7.3 64-bit

需要额外安装的库：

> virtualenv-16.6.0： `pip install virtualenv`

> requests-2.22.0： `pip install requests`
>
> 所依赖的模块：`URLlib3` 在安装 `requests` 时会自动`安装
`尝试切换页面， 查看地址栏 URL 的变化
> BeautifulSoup4-4`.8.`, 未发生改变ip install BeautifulSoup4`

> pandas: `pip install pandas`
>
> 所依赖的模块：`pytz` ,`numpy`, `python-dateutil`, `six`, 在安装 `requests` 时会自动安装

> tqdm-4.36.1: `pip install tqdm`

## 1.2. 抓取数据

> 数据的抓取是构建数据仓库的第一步，首先需要确定数据来源，这个过程通常需要比较各个数据平台，考核数据平台的数据与研究需求的符合程度；具体表现在以下方面：
> - 数据的**可靠性**
>   - 指数据来源是否可靠，有无数据敏感等潜在问题
> - 数据的**完整性**
>   - 指与需求所需的数据相比是否有所缺失
>   - 数据是否齐全
> - 获取的**难易度**
>   - 抓取过程的实现难度

在本选题中，对数据的需求主要是**成交量**, 而成交量又分为**分时数据**(单位时间为一交易日中的若干分钟)和**分日数据**(单位时间为一个交易日)，分时数据的数据量较为庞大，在这里，主要还是针对分日数据进行研究，由于股市的特殊性， 单一的成交量很难制定出可能有效的策略，所以在研究过程中，依旧需要其他的数据作为辅助，综上所述， 在数据抓取阶段，主要需要抓取的数据是：
- 股票代码列表
- 日线数据

### 1.2.1. 新浪财经

#### 1.2.1.1. 抓取所有股票代码

进入新浪财经官网进行查找， 可以在

```bash
行情中心首页 > 沪深股市 > 排行 > A股成交额
```

找到成交额的排行耪， 这里可以获取到所有沪深A股的股票代码; 链接地址如下：

> [http://vip.stock.finance.sina.com.cn/mkt/#stock_hs_amount](http://vip.stock.finance.sina.com.cn/mkt/#stock_hs_amount)

**分析页面**

首先可以看到请求的 url 中有 `#` 字符，使用了 `hash` 路由, 初步判断页面使用前端框架加打包工具构建， 数据很可能是异步加载的；

尝试跳转下一页， 页面的 `url` 没有发生变化（并未出现page或相应页码等关键字）, 所以通过调试工具（F12打开开发者工具）, 切换到 网络（`Network`）栏， 只查看 `XHR` ( `XMLHttpRequest` ), 此时在跳转页码时， 会通过 `GET` 请求获取数据， 分析请求的 `url` 如下:

```bash
https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=3&num=40&sort=amount&asc=0&node=hs_a&symbol=&_s_r_a=auto
```

在其中最为关键的数据即是 `page` 的值，而其返回的数据格式为喜闻乐见的 `json`，至此抓取的准备工作全部完毕， 可以进行抓取，在抓取的时候需要注意的是预防因并发过高导致本机 `ip` 被封锁， 关于这一点的预防手段在  作详述；

**数据抓取**

在浏览器中直接访问链接可以请求到数据内容， 查看页面编码为 `GBK` ,直接使用 `requests` 模块通过 `GET` 请求页面，初步抓取到数据， 尝试直接使用 `json.loads()` 将字符串转为字典发生错误， 这里对获取的字符串进行分析，其基本格式如下：

```json
[
    {symbol:"sh600519",code:"600519",name:"贵州茅台",trade:"1178.580", ...},
    ...
]
```

关键在于其格式不符合 `json` 的基本格式， 这种格式在 `JavaScript` 中作为对象可以解析， 但对 `json` 来说是不合法的；尝试使用 `eval()` / `ast.literal_eval()` 来替代 `json`, 同样无法直接解析， 所以需要更改思路， 手动更改字符串的格式， 给字典的键添加双引号， 编写正则替换方法如下：

```py
def json_format(self, str):
    import re
    str = re.sub(u'{([^{:]*):', u'{"\\1":', str)
    str = re.sub(u',([^,:{]*):', u',"\\1":', str)
    str = str.replace(' ', '')
    return str
```

#### 1.2.1.2. 抓取日线数据

在新浪财经数据中心， 我并没有找到**交易数据**的表格, 要获取某只股票的 `日线` / `分线`的数据只能通过点击某只股票进入其[详情界面](https://finance.sina.com.cn/realstock/company/sh601789/nc.shtml)(同时，url中的股票代码对应相应的股票), 在详情页中，新浪财经的数据并非以表格的形式展示， 而是通过图表展示， 鼠标移过(`hover`)时更新当前股票的数据信息;其样式如下图所示：

![1.2.1.2-1](./static/imgs/1.2.1.2-1.png)


初步判断新浪财经应该是使用了类似 [ECharts](https://www.echartsjs.com/zh/option-gl.html#globe) 的数据可视化库，即通过 `canvas` 绘制，这对网络爬虫是及其不友好的，无法直接从网页的结构中获取数据；

所以更改思路，分析 `js` 源码, 找到鼠标移动时的监听事件，这一过程主要是为了：

+ 查明 JS 如何更新数据
+ JS 从哪里获取数据

首先， 通过页面元素审查可以发现， 分时线是通过`HTML5`的`canvas`绘制的， 在`Sources`找相关的`js`文件， 可以找到`paintSth.js`文件， 由于在鼠标移动时会更新页面元素， 所以可以直接在文件中查找 `mousemove`， 找到了相关代码如下:

```js
C = this.interactCanvas,
...
...
...
C.addEventListener("mousemove", o),
```

**需要注意的是**，我们可以获取到的 js 源码一般都是经过 `webpack` 之类的工具打包的，通常打包后的代码，可读性会变差，主要表现在：
- 代码量增多
  + 解决设备兼容性
  + 编译预处理语言
  + ES6、ES7的向下兼容
  + ...
- 注释的丢失
- 代码缩进
- 打包工具对原命名的处理

在这里，代码可读性可以说是比较友好的， 可以看到`canvas`加了一个`mousemove`的监听器， 执行`o`, 再查找`o()`, 可以找到如下代码：

```js
function o() {
    if (!c) {
        var t = document.createElement("canvas");
        c = t.getContext("2d")
    }
    return c
}
```
但这里 `c` 又是一个未知量， 所以应该继续检索 `c` 的信息， 由于关联的js文件较多， 这种做法过于费时费力， 爬取新浪财经的交易数据应该不是明智的选择；

**换种思路**， 可以使用全能的 `Selenium` (`+` `PhentomJS`), `Selenium` 是一个自动化脚本工具， 而 `PhentomJS` 是一个无界面浏览器,在有图形界面的环境下， 可以只使用 `Selenium` (但图形界面的渲染难免会造成性能上的差距);
通过 `selenium`, 让鼠标在固定位置移动， 同时抓取更新的信息， 这种做法是可行的, 而我也尝试了这一方法，可以抓取到数据， 但是存在的问题是：

- 效率低，耗时久
- 由于鼠标移动的像素原因，可能出现数据遗漏
- 默认显示的数据范围不确定，即无法控制刷子（`brush`, 术语来自 Echarts 的配置项， 即控制显示区域的滑块）

### 1.2.2. 网易财经

#### 1.2.2.1 获取所有股票代码

网易财经的所有 **沪深A股** 数据位于

> http://quotes.money.163.com/old/#query=EQA&DataType=HS_RANK&sort=PERCENT&order=desc&count=24&page=0
> 

从 `url` 来看， 换页通过 `url` 传参来实现， 但是实际操作可以发现， 点击换页时 `url` 中的 `page` 并不会改变， 尝试改变 `url` 中的 `page` 参数， 当前页面仍未改变，仔细看可以看到 `url` 中带有显式的 `#`, 可见是有前端的 `hash` 路由, 判断所有数据是异步加载的， 这就意味着无法像 [1.2.1. 新浪财经](#121-新浪财经) 中爬取新浪财经一样， 枚举 `url` 的 `page` 参数来爬取所有信息；

对于**网易财经**，由于点击换页时页面的 `url` 没有更新，所以应该是使用了 `Ajax` 来异步更新数据， 通过`F12`调起开发者工具， 在 `Network` 选型卡中， 筛选 `XHR` (`XMLHttpRequest`), 每当点击换页时， 就会有新的 `XHR`， 分析这些 `XHR` 的 `url` 如下，可以发现，只有 `page` 值在改变：

![1.2.2.1-1](./static/imgs/1.2.2.1-1.png)

可以看到请求方法（Request Method）为 `GET`, 所以可以直接复制 `Request URL` 并使用浏览器访问， 可以得到 `json` 格式的数据， 但是中文通过 `Unicode` 编码了， 在获取后， 可以通过(`python`) `s.decode('unicode_escape')` 来解码；接下来就是对 `json` 解析并提取需要的信息了， `json` 格式如下：

![1.2.2.1-2](./static/imgs/1.2.2.1-2.png)

&emsp;&emsp;在 `list` 中有`[0]`到`[23]`共`24`条数据， 对应请求中的参数 `count=24`， 关于字段名的解释， 以下为我的分析：

|  No.  |  key_name   |                           meaning                            |
| :---: | :---------: | :----------------------------------------------------------: |
|   1   |  ANNOUNMT   | 公告信息，并非必须，对应在页面中有公告标签的股票才有这个字段 |
|   2   |    CODE     |                           股票代码                           |
|   3   | FIVE_MINUTE |                         5分钟涨跌额                          |
|   4   |    HIGH     |                             最高                             |
|   5   |     HS      |                        换手率(不带%)                         |
|   6   |     LB      |                             量比                             |
|   7   |     LOW     |                             最低                             |
|   8   |    MCAP     |                           流通市值                           |
|   9   |   MFRATIO   |    list, 包含2个值`MFRATIO2`:净利润， `MFRATIO10`: 主营收    |
|  10   |    MFSUM    |                           每股收益                           |
|  11   |    NAME     |                             名称                             |
|  12   |     NO      |                       网易财经中的编号                       |
|  13   |    OPEN     |                           今日开盘                           |
|  14   |     PE      |                            市盈率                            |
|  15   |   PERCENT   |                            涨跌幅                            |
|  16   |    PRICE    |                             价格                             |
|  17   |    TCAP     |                            总市值                            |
|  18   |  TURNOVER   |                            成交额                            |
|  19   |   VOLUME    |                            成交量                            |
|  20   |     WB      |                             委比                             |

&emsp;&emsp;所以可以直接抓取这个url来获取相关的数据， 更有趣的是， 请求参数中有个`count`参数， 决定了数据的数量， 所以我尝试将`count`设置成全部数量, 查看网易财经沪深A股， 网易的编号最后一只为`3607`， 所以如下请求：

```js
'http://quotes.money.163.com/hs/service/diyrank.php?host=http%3A%2F%2Fquotes.money.163.com%2Fhs%2Fservice%2Fdiyrank.php&page=0&query=STYPE%3AEQA&fields=NO%2CSYMBOL%2CNAME%2CPRICE%2CPERCENT%2CUPDOWN%2CFIVE_MINUTE%2COPEN%2CYESTCLOSE%2CHIGH%2CLOW%2CVOLUME%2CTURNOVER%2CHS%2CLB%2CWB%2CZF%2CPE%2CMCAP%2CTCAP%2CMFSUM%2CMFRATIO.MFRATIO2%2CMFRATIO.MFRATIO10%2CSNAME%2CCODE%2CANNOUNMT%2CUVSNEWS&sort=PERCENT&order=desc&count=3607&type=query'
```

即可返回所有json格式的数据， 然后再进行解析， 并写入文件， 完整代码不在这里赘述。

#### 1.2.2.2. 获取日线数据

网易财经的日线交易数据位于：

> [http://quotes.money.163.com/trade/lsjysj_601318.html#06f01](http://quotes.money.163.com/trade/lsjysj_601318.html#06f01)

URL 中的 `601318` 对应为股票的代码， 打开页面分析页面内容， 在这个页面没有换页按钮， 仅显示若干条数据， 但是在数据表的右上角有个下载数据的链接， 点击后， 需要勾选需要下载的字段， 点击下载后会下载一个 `[code].csv` 文件， 所以要做的就是抓取下载的真实 `URL`, 按  `F12` 打开开发者工具， 点击下载按钮后， 在控制台看到如下提示：

![1.2.2.2-1](./static/imgs/1.2.2.2-1.png)

这里已经暴漏了真实的下载地址，即：

> http://quotes.money.163.com/service/chddata.html?code=0601318&start=20070301&end=20191122&fields=TCLOSE;HIGH;LOW;TOPEN;LCLOSE;CHG;PCHG;TURNOVER;VOTURNOVER;VATURNOVER;TCAP;MCAP

而想要搞清楚 `URL` 的参数， 可以转到执行 `submit` 的文件， 这里即 `b.667271.min.js:1` , 这是一个工程化代码缩进后的 `js` 文件， 通过格式化工具格式化后， 在最后可以找到如下关键代码：

```js
submit: function() {
    var e = n.value;
    if (e) e = e.replace(/-/g, "");
    var a = i.value;
    if (a) a = a.replace(/-/g, "");
    var o = t.elem.getElementsByTagName("input"),
    r = [];
    for (var d = 0; d < o.length; d++) {
        if (o[d].type == "checkbox" && o[d].checked) {
            r.push(o[d].value)
        }
    }
    var c = "/service/chddata.html?code=" + window["STOCKCODE"];
    e && /^\d{8}$/.test(e) && (c += "&start=" + e);
    a && /^\d{8}$/.test(a) && (c += "&end=" + a);
    r.length && (c += "&fields=" + r.join(";"));
    location.href = c
}
```

能够清楚地看到url的拼接过程， 具体参数如下

|  No.  |  param   |    meaning     |                                                                               rule                                                                                |
| :---: | :------: | :------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|   1   | `start`  |    起始日期    |                                                      年月日直接拼接，如`20191027`，月份及日期不足`2`位补`0`                                                       |
|   2   |  `end`   |    截止日期    |                                                      年月日直接拼接，如`20191027`，月份及日期不足`2`位补`0`                                                       |
|   3   | `fields` | 需要下载的字段 |                        使用 `;`分割，如：`TCLOSE;HIGH;LOW;TOPEN;LCLOSE;CHG;PCHG;TURNOVER;VOTURNOVER;VATURNOVER;TCAP;MCAP` 具体意义不作详述                        |
|   4   |  `code`  |    股票代码    | 关于股票代码， 网易财经的股票代码在传参时， 如果是以 `6` 开头的股票， 需要在前面加 `0`, 而以`0`和`3`开头的股票需要在前面加`1`,如：`1000333`, `1300001`, `0601318` |

接下来是做抓取， 抓取就是根据已经获取的股票代码， `枚举股票代码`并下载对应的日线数据， 仅需注意每次循环最好使用 `time.sleep(random.random()*2)`， 否则可能因操作频繁被拒绝访问

### 1.2.3. 东方财富

#### 1.2.3.1.  获取所有股票代码

在东方财富网站中，我没有找到合适的页面，但在[实时资金流向排行](http://data.eastmoney.com/zjlx/detail.html)中可以看到约 `3800` 只股票的数据

还是通过常规方法测试该页面，初步测试的情况如下：

- 查看 `URL` 没有发现带有页码的参数
- 尝试切换页面， 查看地址栏 `URL`, 未发生改变
- 尝试切换页面， 抓取 `XHR`, 并没有 `XHR`

这种情况比较少见，即不是通过 `URL` 传参来获取，所以在换页时， 尝试抓取 `XHR` 之外的请求,结果如下：

![1.2.3.1-1](./static/imgs/1.2.3.1-1.png)

看到请求方法是 `GET`, 尝试直接使用浏览器访问，无法访问， 尝试使用 `Postman` 接口测试工具来请求：

![1.2.3.1-2](./static/imgs/1.2.3.1-2.png)

判断 东方财富应该是设置了反爬虫的策略， 又或者是其工程化工具对 `.gif` 的特殊解析，抓取数据实现较为困难。

#### 1.2.3.2.  获取日线数据

东方财富的日线数据的表现形式与新浪财经相同， 均采用了数据可视化的框架，数据以 动态的 `canvas` 呈现, 如下图所示：

![1.2.3.2-1](./static/imgs/1.2.3.2-1.png)

东方财富的交易数据地址：[http://quote.eastmoney.com/sh600175.html](http://quote.eastmoney.com/sh600175.html)(路径中的`600175` 对应相应的股票代码)；

和新浪财经一样，这种展现形式对网络爬虫是极其不友好的，无法直接从网页的元素中解析出数据，数据通过 `canvas` 绘制, 想要获取数据，正确的思路应该是获取渲染数据的来源，即从可视化框架的配置项的配置过程中自底向上寻找数据来源。执行如下步骤：

- 刷新页面，抓取 `XHR`: 仅有 `3` 个无关 `XHR`
- 刷新页面，抓取 `JS`: 有大量的 `JS` , 逐个检查其 `Preview`:
  - 首先可以找到**分时数据**的请求源, 对应上面的第一个 `canvas` ，数据格式如下：
  - ![1.2.3.2-2](./static/imgs/1.2.3.2-2.png)
  - 但本研究的数据需求重心在于日线数据，所以继续检查 `js` 请求，很快就能找到请求`response`如下的 `JS`： 
  - ![1.2.3.2-3](./static/imgs/1.2.3.2-3.png)
  - 这正是需要的数据，查看 `Headers` 来确定请求的方式，请求方式为 `GET` , 其 `Request URL` 为:
  - > [http://pdfm.eastmoney.com/EM_UBG_PDTI_Fast/api/js?rtntype=5&token=4f1862fc3b5e77c150a2b985b12db0fd&cb=jQuery112409397171122443517_1574509941395&id=6001751&type=k&authorityType=&_=1574509941411](http://pdfm.eastmoney.com/EM_UBG_PDTI_Fast/api/js?rtntype=5&token=4f1862fc3b5e77c150a2b985b12db0fd&cb=jQuery112409397171122443517_1574509941395&id=6001751&type=k&authorityType=&_=1574509941411)
  - 使用 `Postman` 解析参数如下：

|  No.  |      param      |                    value                    |
| :---: | :-------------: | :-----------------------------------------: |
|   1   |    `rtntype`    |                     `5`                     |
|   2   |     `token`     |     `4f1862fc3b5e77c150a2b985b12db0fd`      |
|   3   |      `cb`       | `jQuery112409397171122443517_1574509941395` |
|   4   |      `id`       |                  `6001751`                  |
|   5   |     `type`      |                     `k`                     |
|   6   | `authorityType` |                 `undefined`                 |
|   7   |       `_`       |               `1574509941411`               |

直接使用浏览器请求该 `URL` 可以直接获取到数据， 使用 `Postman` 测试也能抓取到数据， 尝试改变参数中的 `id` 值，即更改股票代码获取日线数据时， 发现同样可以获取到数据，但数据格式上， 东方财富的数据格式可读性可以说是非常差， 其储存方式为一维数组，单日的数据以字符串的形式存储， 不同的参数间用逗号分隔， 示例如下：

```js
"data": [
    "1994-04-05,19.45,19.70,20.20,17.80,24484,46657000,12.07%,28.8",
    ...
    "2019-11-22,7.12,7.09,7.23,7.06,20841,14859296,2.4%,0.28"
]
```
这里只能手动去比较东方财富数据可视化的 `canvas` 中反馈的数据字段名了, 结果对照如下：

| 数组下标 |    示例值    | 字段名 |
| :------: | :----------: | :----: |
|    0     | `2019-11-22` |  日期  |
|    1     |    `7.12`    |  开盘  |
|    2     |    `7.09`    |  收盘  |
|    3     |    `7.23`    |  最高  |
|    4     |    `7.06`    |  最低  |
|    5     |   `20841`    | 成交量 |
|    6     |  `14859296`  | 成交额 |
|    7     |    `2.4%`    |  振幅  |
|    8     |    `0.28`    |   /    |

接下来最大的问题就是能否频繁抓取的问题了，这里让我特别在意的是 `URL` 中的 `token` 和 `cb` , 一般来说， `token` 是作为一个验证项， 通常会进行加密， 并且具有时效性，如果东方财富同样进行了这样的处理， 那么数据抓取就会有大幅的难度, 而 `cb` 乍一看看不出其实际意义， 但其 `value` 为复杂的字符串, 初步判断也是进行权限验证的, 在一定时间内或一定请求频率内， `token` 和 `cb` 是不会失效的， 这意味着有通过接口直接爬取的可能, 而如果这个方式行不通， 那么就需要知道 `token` 和 `cb` 的前端计算方式，从而进行数据抓取。

- 直接在 `source` 中搜索 `token` 来查找，可以找到 `token` 的定义如下:
- ![1.2.3.2-4](./static/imgs/1.2.3.2-4.png)
- 但在搜索 `cb` 时却无法搜索到相关处理
- 尝试更改 `cb` 的值进行请求，可以发现，`cb` 其实是前端接收数据时调用的方法名，具体来说， 东方财富请求数据是通过 `jsonp` 来处理跨域，那么 `cb` 即指定回调函数的函数名， 所以 `cb` 实际上是 `callBack` 的缩写
- 尝试使用 `request URL` 直接抓取, 发现有可能收到数据如下：
```js
    jQuery1124036208821942748104_1574562443091({stats:false})
```
- 编写爬虫代码，尝试抓取单只股票， 成功抓取到，但尝试抓取全部，可能会因无法获取被中断，看来是东方财富在反爬虫上确实下了功夫。

> 如果以上方法行不通，那么考虑的方向则是动态抓包获取 `token` 和 `cb`, 需要考虑 `scapy`、`pypcap`、`pkdt`等工具；

### 1.2.4. TuShare (挖地兔)

#### 1.2.4.1. 概述

TuShare 是一个免费开源的第三方数据平台，以下是官方介绍：

> `Tushare`是一个`免费`、`开源`的 `python` 财经数据接口包。主要实现对股票等金融数据从**数据采集**、**清洗加工** 到**数据存储**的过程，能够为金融分析人员提供快速、整洁、和多样的便于分析的数据，为他们在数据获取方面极大地减轻工作量，使他们更加专注于策略和模型的研究与实现上。

**接口文档地址**：[http://tushare.org/](http://tushare.org/)

**ToShare Pro**: [https://tushare.pro/](https://tushare.pro/)

#### 1.2.4.2. 基本使用

**环境依赖**

- Python 2/3 (`Python 2.7 will reach the end of its life on January 1st, 2020`)
- Pandas
- lxml

**安装**

- 方式1：`pip install tushare`
- 方式2：访问[https://pypi.python.org/pypi/Tushare/](https://pypi.python.org/pypi/Tushare/)下载安装

**使用**

以[历史行情接口](http://tushare.org/trading.html#id2)为例，如下使用：

```py
import tushare as ts

ts.get_hist_data('600848')      #一次性获取全部日k线数据
```

返回数据如下：

![1.2.4.2-1](./static/imgs/1.2.4.2-1.png)

### 1.2.5. 其他平台

#### 1.2.5.1. W.ind

官网: [https://www.wind.com.cn/Default.html](https://www.wind.com.cn/Default.html)

> 中国市场的精准金融数据服务供应商，为量化投资与各类金融业务系统提供准确、及时、完整的落地数据，内容涵盖 股票、债券、基金、衍生品、指数、宏观行业等各类金融市场数据，助您运筹帷幄，决胜千里

#### 1.2.5.2. 优矿

官网: [https://uqer.io/](https://uqer.io/)

> 提供各类资产的财务、因子、主题、宏观行业特色大数据，以及量化场景下的PIT数据，保障量化过程不引入未来数据。 股票、期货、指数、场内外基金等多资产多策略回测。丰富的衍生工具，保证多因子策略、事件驱动等快速实现。

## 1.3. 数据获取总结
