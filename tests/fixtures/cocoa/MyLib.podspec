Pod::Spec.new do |s|
  s.name         = 'MyLib'
  s.version      = '2.1.0'
  s.summary      = 'My test library'
  s.license      = 'MIT'
  s.homepage     = 'https://github.com/example/mylib'
  s.author       = { 'Test Author' => 'test@example.com' }
  s.source       = { :git => 'https://github.com/example/mylib.git', :tag => s.version }

  s.dependency 'Alamofire', '~> 5.8'
  s.dependency 'SDWebImage', '>= 5.0'
  s.dependency 'SnapKit', '~> 5.6'
end
